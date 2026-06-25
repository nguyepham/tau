#!/usr/bin/env node
/**
 * Zen dependency verifier / repairer.
 *
 * The published package externalizes its runtime dependencies, so a broken
 * node_modules (interrupted update, EPERM cleanup on Windows, antivirus
 * locks...) crashes the CLI at runtime with "Cannot find module". This
 * script checks that every declared runtime dependency is actually present
 * and, when asked, repairs the tree by re-running `npm install` inside the
 * package root.
 *
 * It is intentionally dependency-free (node builtins only): it must run
 * precisely when node_modules is broken.
 *
 * Usage:
 *   node scripts/verify-deps.mjs            # verify, exit 1 if missing
 *   node scripts/verify-deps.mjs --repair   # verify, repair, re-verify
 *   node scripts/verify-deps.mjs --quiet    # no progress bar, summary only
 *   node scripts/verify-deps.mjs --json     # machine-readable result
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const defaultPackageRoot = resolve(dirname(__filename), "..");

/** Runtime dependencies the bundle resolves from node_modules at runtime. */
export function listRuntimeDeps(packageRoot) {
  // strip a UTF-8 BOM if an editor/tool added one
  const pkg = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8").replace(/^﻿/, ""),
  );
  return Object.keys(pkg.dependencies ?? {}).sort();
}

/**
 * True if `dep` resolves from `packageRoot` the way Node's resolver would:
 * packageRoot/node_modules first, then each parent directory's node_modules
 * (covers global installs, local project installs, and the dev repo).
 */
function depResolves(packageRoot, dep) {
  let dir = resolve(packageRoot);
  for (;;) {
    if (existsSync(join(dir, "node_modules", dep, "package.json"))) {
      return true;
    }
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/** Names of declared runtime deps that do NOT resolve. Fast (<10ms). */
export function findMissingDeps(packageRoot = defaultPackageRoot) {
  return listRuntimeDeps(packageRoot).filter(
    (dep) => !depResolves(packageRoot, dep),
  );
}

/** One-line progress bar on stderr (TTY only — silent when piped). */
function drawProgress(current, total, label) {
  if (!process.stderr.isTTY) return;
  const width = 24;
  const filled = Math.round((current / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const line = `\r[zen] [${bar}] ${current}/${total} ${label}`;
  process.stderr.write(line.padEnd(Math.min(79, line.length + 20)));
  if (current === total) process.stderr.write("\n");
}

/**
 * Verify all runtime deps with a visible progress bar.
 * Returns { total, missing } where missing is an array of package names.
 */
export function verifyDeps(packageRoot = defaultPackageRoot, opts = {}) {
  const deps = listRuntimeDeps(packageRoot);
  const missing = [];
  deps.forEach((dep, i) => {
    if (!depResolves(packageRoot, dep)) missing.push(dep);
    if (!opts.quiet) drawProgress(i + 1, deps.length, dep);
  });
  return { total: deps.length, missing };
}

/**
 * Repair the dependency tree by running `npm install` inside packageRoot.
 * Interactive mode inherits stdio so npm's own progress bar is visible.
 * Returns true if npm exited 0.
 */
export function repairDeps(packageRoot = defaultPackageRoot, opts = {}) {
  const interactive = opts.interactive ?? process.stderr.isTTY;
  const args = [
    "install",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    ...(interactive ? [] : ["--loglevel=error", "--progress=false"]),
  ];

  const env = {
    ...process.env,
    // The install re-triggers our own postinstall; keep it from recursing
    // into another verify/repair cycle or slow optional steps.
    TAU_REPAIR: "1",
    TAU_SKIP_OLLAMA_PREPULL: "1",
    TAU_SKIP_NATIVE_TOOLS_POSTINSTALL: "1",
  };

  // Prefer the exact npm that is driving the current lifecycle when
  // available (postinstall), otherwise the npm on PATH. `.cmd` shims need
  // shell:true on Windows with modern Node.
  const npmExecPath = process.env.npm_execpath;
  const useNpmJs = npmExecPath && /\.[cm]?js$/.test(npmExecPath);
  const result = useNpmJs
    ? spawnSync(process.execPath, [npmExecPath, ...args], {
        cwd: packageRoot,
        env,
        stdio: interactive ? "inherit" : "pipe",
      })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
        cwd: packageRoot,
        env,
        stdio: interactive ? "inherit" : "pipe",
        shell: process.platform === "win32",
      });

  return result.status === 0;
}

/** Human-readable manual recovery instructions. */
export function manualFixInstructions(packageName) {
  return [
    `Zen's installation is incomplete and automatic repair did not finish.`,
    `To fix it manually, run:`,
    ``,
    `  npm uninstall -g ${packageName}`,
    `  npm install -g ${packageName}`,
    ``,
    `If npm reports EEXIST on a 'zen' or 'claudex' file, delete that file`,
    `and re-run the install. If it reports EPERM on Windows, close every`,
    `running zen/claudex session first, then retry.`,
  ].join("\n");
}

/**
 * Full check-and-heal pass: verify → repair if needed → re-verify.
 * Returns true when the tree is complete at the end.
 */
export function ensureDeps(packageRoot = defaultPackageRoot, opts = {}) {
  const log = opts.quiet ? () => {} : (msg) => process.stderr.write(`${msg}\n`);
  const { total, missing } = verifyDeps(packageRoot, opts);

  if (missing.length === 0) {
    log(`[zen] ✓ ${total}/${total} runtime dependencies verified`);
    return true;
  }

  log(
    `[zen] ${missing.length} of ${total} runtime dependencies are missing:` +
      ` ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", ..." : ""}`,
  );

  if (!opts.repair) return false;

  log(`[zen] Repairing installation (npm install in ${packageRoot})...`);
  repairDeps(packageRoot, opts);

  const after = verifyDeps(packageRoot, { quiet: true });
  if (after.missing.length === 0) {
    log(`[zen] ✓ Repair complete — ${total}/${total} dependencies verified`);
    return true;
  }
  log(`[zen] Repair incomplete — still missing: ${after.missing.join(", ")}`);
  return false;
}

// ─── CLI entrypoint ────────────────────────────────────────────────

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === __filename;

if (invokedDirectly) {
  const flags = new Set(process.argv.slice(2));
  const quiet = flags.has("--quiet") || flags.has("--json");
  const repair = flags.has("--repair");

  let ok = false;
  try {
    if (flags.has("--json")) {
      const { total, missing } = verifyDeps(defaultPackageRoot, {
        quiet: true,
      });
      ok =
        missing.length === 0 ||
        (repair && ensureDeps(defaultPackageRoot, { repair, quiet: true }));
      const after = verifyDeps(defaultPackageRoot, { quiet: true });
      process.stdout.write(
        `${JSON.stringify({ total, missing: after.missing, ok })}\n`,
      );
    } else {
      ok = ensureDeps(defaultPackageRoot, { repair, quiet });
      if (!ok && repair) {
        process.stderr.write(
          `\n${manualFixInstructions(JSON.parse(readFileSync(join(defaultPackageRoot, "package.json"), "utf8")).name)}\n`,
        );
      }
    }
  } catch (err) {
    process.stderr.write(`[zen] verify-deps failed: ${err?.message ?? err}\n`);
    ok = false;
  }
  process.exit(ok ? 0 : 1);
}
