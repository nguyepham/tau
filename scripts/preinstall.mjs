#!/usr/bin/env node
/**
 * Zen preinstall — clears orphaned global bin shims before npm links bins.
 *
 * When a previous global update was interrupted (EPERM cleanup on Windows,
 * Ctrl-C, antivirus locks), npm can lose track of the `zen` / `claudex`
 * shims it created earlier. The next `npm install -g` then aborts with:
 *
 *   npm error code EEXIST
 *   npm error File exists: C:\Users\...\npm\claudex
 *
 * npm runs this script after extracting the package but BEFORE linking bin
 * shims, so removing stale shims here lets the install proceed. Only shims
 * that belong to this package (or are dangling) are touched; a shim owned
 * by some other package gets a warning instead.
 *
 * Never fails the install: every path is wrapped and the script exits 0.
 */

import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN_NAMES = ["zen", "claudex"];
const WIN_EXTS = ["", ".cmd", ".ps1"];

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function getPackageName() {
  try {
    return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
      .name;
  } catch {
    return "@abdoknbgit/zen";
  }
}

/**
 * For a global install, this package lives at <prefix>/(lib/)node_modules/
 * <scope>/<name>. Walk up to the node_modules dir to find the bin dir:
 * on Windows the prefix itself, elsewhere <prefix>/bin.
 */
function getGlobalBinDir() {
  // packageRoot = .../node_modules/@scope/name → up 2 = node_modules
  const nodeModules = resolve(packageRoot, "..", "..");
  if (basename(nodeModules) !== "node_modules") return null; // dev repo / npm link
  const prefixOrLib = dirname(nodeModules);
  if (process.platform === "win32") {
    // %APPDATA%\npm\node_modules → bin shims live in %APPDATA%\npm
    return prefixOrLib;
  }
  // <prefix>/lib/node_modules → <prefix>/bin ; <prefix>/node_modules → <prefix>/bin
  const prefix =
    basename(prefixOrLib) === "lib" ? dirname(prefixOrLib) : prefixOrLib;
  return join(prefix, "bin");
}

/** Does this shim/symlink belong to us, or point at nothing? */
function classifyShim(shimPath, packageName) {
  try {
    const stat = lstatSync(shimPath);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(shimPath);
      const resolved = resolve(dirname(shimPath), target);
      if (!existsSync(resolved)) return "dangling";
      const normalized = resolved.split("\\").join("/");
      return normalized.includes(`node_modules/${packageName}/`)
        ? "ours"
        : "foreign";
    }
    // Windows .cmd/.ps1 shims embed the package path with backslashes;
    // normalize so '@scope\name' still matches '@scope/name'.
    const content = readFileSync(shimPath, "utf8").split("\\").join("/");
    if (content.includes(packageName)) return "ours";
    // sh/cmd/ps1 shims embed the relative target path; if that file is
    // gone the shim is dead weight from a broken uninstall.
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

function main() {
  const binDir = getGlobalBinDir();
  if (!binDir || !existsSync(binDir)) return; // not a global install

  const packageName = getPackageName();
  const exts = process.platform === "win32" ? WIN_EXTS : [""];

  for (const name of BIN_NAMES) {
    for (const ext of exts) {
      const shimPath = join(binDir, name + ext);
      try {
        if (!lstatSync(shimPath)) continue;
      } catch {
        continue; // doesn't exist
      }

      const kind = classifyShim(shimPath, packageName);
      if (kind === "ours" || kind === "dangling") {
        try {
          unlinkSync(shimPath);
          console.log(
            `[zen] Removed stale '${name}${ext}' launcher left by a previous install`,
          );
        } catch {
          // npm may still EEXIST; the error message tells the user what to delete.
        }
      } else if (kind === "foreign") {
        console.warn(
          `[zen] Warning: '${shimPath}' belongs to another package. ` +
            `If this install fails with EEXIST, remove that package first ` +
            `(npm ls -g, then npm uninstall -g <package>).`,
        );
      }
    }
  }
}

try {
  main();
} catch {
  // Never block the install.
}
process.exit(0);
