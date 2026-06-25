/**
 * Install integrity helpers for the global updater.
 *
 * Interrupted global updates (Windows EPERM cleanup failures, Ctrl-C,
 * antivirus locks) leave two kinds of damage behind:
 *
 *  1. Orphaned `zen` / `claudex` bin shims npm no longer tracks — the next
 *     `npm install -g` aborts with EEXIST on those files.
 *  2. Holes in the installed package's node_modules — the CLI later crashes
 *     with "Cannot find module '<dep>'".
 *
 * These helpers clean stale shims before installing, recover from an EEXIST
 * abort, and verify/repair the freshly installed tree via the package's own
 * dependency-free scripts/verify-deps.mjs.
 */

import { existsSync } from "fs";
import { lstat, readFile, readlink, unlink } from "fs/promises";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { logForDebugging } from "./debug.js";
import { execFileNoThrowWithCwd } from "./execFileNoThrow.js";
import { writeToStdout } from "./process.js";

const BIN_NAMES = ["zen", "claudex"];
const WIN_EXTS = ["", ".cmd", ".ps1"];

/** Bin shim directory for a given npm/bun global prefix. */
function getBinDir(prefix: string, isBun: boolean): string {
  if (isBun) return prefix; // `bun pm bin -g` already returns the bin dir
  return process.platform === "win32" ? prefix : join(prefix, "bin");
}

type ShimKind = "ours" | "dangling" | "foreign" | "unknown";

/** Decide whether a shim belongs to this package or points at nothing. */
async function classifyShim(shimPath: string): Promise<ShimKind> {
  try {
    const stat = await lstat(shimPath);
    if (stat.isSymbolicLink()) {
      const target = await readlink(shimPath);
      const resolved = resolve(dirname(shimPath), target);
      if (!existsSync(resolved)) return "dangling";
      return resolved
        .split("\\")
        .join("/")
        .includes(`node_modules/${MACRO.PACKAGE_URL}/`)
        ? "ours"
        : "foreign";
    }
    // Windows .cmd/.ps1 shims embed the package path with backslashes;
    // normalize so '@scope\name' still matches '@scope/name'.
    const content = (await readFile(shimPath, "utf8")).split("\\").join("/");
    if (content.includes(MACRO.PACKAGE_URL)) return "ours";
    const match = content.match(/node_modules[\\/][^"'\s:]+/);
    if (match) {
      const target = resolve(dirname(shimPath), match[0]);
      if (!existsSync(target)) return "dangling";
    }
    return "foreign";
  } catch {
    return "unknown";
  }
}

/**
 * Remove `zen`/`claudex` launcher shims in the global bin dir that belong
 * to this package or dangle into a deleted install. npm recreates them
 * during the install that follows, so this is always safe — and it is the
 * fix for `npm error code EEXIST ... File exists: ...\npm\claudex`.
 */
export async function cleanStaleBinShims(
  prefix: string | null,
  isBun: boolean,
): Promise<void> {
  if (!prefix) return;
  const binDir = getBinDir(prefix, isBun);
  const exts = process.platform === "win32" ? WIN_EXTS : [""];

  for (const name of BIN_NAMES) {
    for (const ext of exts) {
      const shimPath = join(binDir, name + ext);
      if (!existsSync(shimPath)) {
        // existsSync follows symlinks — a dangling symlink reports false
        // but still blocks npm, so check lstat before skipping.
        try {
          await lstat(shimPath);
        } catch {
          continue;
        }
      }
      const kind = await classifyShim(shimPath);
      if (kind === "ours" || kind === "dangling") {
        try {
          await unlink(shimPath);
          logForDebugging(`installIntegrity: removed stale shim ${shimPath}`);
        } catch (err) {
          logForDebugging(
            `installIntegrity: could not remove shim ${shimPath}: ${err}`,
          );
        }
      }
    }
  }
}

/**
 * Pull the conflicting file path out of an npm EEXIST failure, e.g.
 *   npm error code EEXIST
 *   npm error File exists: C:\Users\me\AppData\Roaming\npm\claudex
 * Returns null when the failure isn't an EEXIST bin conflict.
 */
export function extractEexistPath(npmOutput: string): string | null {
  if (!/\bEEXIST\b/.test(npmOutput)) return null;
  const match = npmOutput.match(/File exists: (.+)/);
  return match?.[1]?.trim() ?? null;
}

/** Remove the EEXIST-conflicting file and its sibling shim variants. */
export async function removeConflictingShim(filePath: string): Promise<void> {
  const variants =
    process.platform === "win32"
      ? [
          filePath.replace(/\.(cmd|ps1)$/i, ""),
          `${filePath.replace(/\.(cmd|ps1)$/i, "")}.cmd`,
          `${filePath.replace(/\.(cmd|ps1)$/i, "")}.ps1`,
        ]
      : [filePath];
  for (const variant of variants) {
    try {
      await unlink(variant);
      logForDebugging(`installIntegrity: removed conflicting ${variant}`);
    } catch {
      // already gone / never existed
    }
  }
}

/** Root directory of the globally installed package, or null. */
export async function getGlobalPackageRoot(): Promise<string | null> {
  const result = await execFileNoThrowWithCwd("npm", ["root", "-g"], {
    cwd: homedir(),
  });
  if (result.code !== 0 || !result.stdout.trim()) return null;
  return join(result.stdout.trim(), ...MACRO.PACKAGE_URL.split("/"));
}

/**
 * Verify (and repair, if needed) the dependency tree of an installed copy
 * of the package by running its bundled scripts/verify-deps.mjs. Returns
 * true when the tree is complete. Versions that predate the verifier are
 * trusted as-is.
 */
export async function verifyInstalledPackage(
  packageRoot: string,
  options: { interactive?: boolean } = {},
): Promise<boolean> {
  const script = join(packageRoot, "scripts", "verify-deps.mjs");
  if (!existsSync(script)) return true;

  if (options.interactive) {
    writeToStdout("Verifying installed dependencies...\n");
  }

  const result = await execFileNoThrowWithCwd(
    process.execPath,
    [script, "--repair", "--quiet"],
    { cwd: homedir(), timeout: 10 * 60 * 1000 },
  );

  if (options.interactive) {
    const output = `${result.stdout}${result.stderr}`.trim();
    if (output) writeToStdout(`${output}\n`);
  }
  logForDebugging(
    `installIntegrity: verify-deps exited ${result.code} for ${packageRoot}`,
  );
  return result.code === 0;
}
