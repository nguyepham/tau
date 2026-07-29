/**
 * Read-before-Edit loop-guard unit tests.
 *
 * Run: bun run src/tools/FileEditTool/readFirstGuard.test.ts
 */

import {
  noteFileRead,
  resetReadFirstGuard,
  shouldBlockUnreadEdit,
} from "./readFirstGuard.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  resetReadFirstGuard();
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL ${name}: ${e?.message ?? String(e)}`);
  }
}

function assert(cond: unknown, hint: string): void {
  if (!cond) throw new Error(hint);
}

const FILE = "/repo/src/app.ts";
const OTHER = "/repo/src/other.ts";

console.log("read-first loop guard:");

test("blocks the first blind edit", () => {
  assert(shouldBlockUnreadEdit(FILE) === true, "first blind edit must block");
});

test("a repeated blind edit stops blocking (no infinite loop)", () => {
  // The whole point: even if the model ignores the error and keeps re-issuing
  // the identical blind edit, the guard must eventually let it through so the
  // agent loop cannot spin forever.
  const decisions: boolean[] = [];
  for (let i = 0; i < 25; i++) decisions.push(shouldBlockUnreadEdit(FILE));
  assert(decisions.includes(false), "guard must stop blocking at some point");
  // And it must stop EARLY (bounded), not after dozens of round-trips.
  const firstProceed = decisions.indexOf(false);
  assert(
    firstProceed >= 0 && firstProceed <= 3,
    `expected to proceed within a few attempts, got index ${firstProceed}`,
  );
});

test("allows at least one retry before degrading", () => {
  assert(shouldBlockUnreadEdit(FILE) === true, "attempt 1 blocks");
  assert(
    shouldBlockUnreadEdit(FILE) === true,
    "attempt 2 (a retry) still blocks",
  );
  assert(
    shouldBlockUnreadEdit(FILE) === false,
    "attempt 3 must proceed so it cannot loop",
  );
});

test("reading the file resets enforcement", () => {
  shouldBlockUnreadEdit(FILE); // count = 1
  noteFileRead(FILE); // model read the file: clear the counter
  // A later blind edit of the same file must be enforced from scratch.
  assert(
    shouldBlockUnreadEdit(FILE) === true,
    "after a read, a new blind edit blocks again",
  );
});

test("counters are per-file, not global", () => {
  // Exhaust FILE's budget entirely.
  shouldBlockUnreadEdit(FILE);
  shouldBlockUnreadEdit(FILE);
  shouldBlockUnreadEdit(FILE); // FILE now degraded
  // A different file must still be enforced independently.
  assert(
    shouldBlockUnreadEdit(OTHER) === true,
    "a different file has its own budget",
  );
});

test("degrade path clears state so the file re-enforces later", () => {
  shouldBlockUnreadEdit(FILE); // 1: block
  shouldBlockUnreadEdit(FILE); // 2: block
  assert(shouldBlockUnreadEdit(FILE) === false, "3: degrade/proceed");
  // The degrade cleared the entry, so a fresh blind edit blocks again rather
  // than being permanently degraded.
  assert(
    shouldBlockUnreadEdit(FILE) === true,
    "after degrade, enforcement restarts",
  );
});

test("stale counters age out via TTL", () => {
  const t0 = 1_000_000;
  assert(shouldBlockUnreadEdit(FILE, t0) === true, "block at t0");
  // Six minutes later (> 5 min TTL) the prior count is purged, so this counts
  // as a fresh first attempt (blocks) rather than an escalation.
  const t1 = t0 + 6 * 60_000;
  assert(
    shouldBlockUnreadEdit(FILE, t1) === true,
    "after TTL the counter resets to a fresh block",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
