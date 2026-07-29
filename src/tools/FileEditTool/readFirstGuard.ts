/**
 * Read-before-Edit loop guard.
 *
 * FileEditTool blocks an edit to a file that was never Read this session, so the
 * model reads first and its old_string is copied from real content instead of
 * guessed. A well-behaved model reads once and the next edit passes: no loop.
 * But a model that ignores the error could re-issue the identical blind edit
 * forever. This guard bounds that: it counts CONSECUTIVE blocks per file and,
 * after a small limit, tells the caller to stop blocking and fall back to
 * seeding read-state from disk (the pre-existing safe behavior: the old_string
 * match still guards correctness, so a wrong guess fails with "String to replace
 * not found", never a silent clobber). Retrying after the error is fine; an
 * infinite loop is not.
 *
 * State is module-level (session/process scoped), keyed by absolute file path,
 * with a short TTL so stale counters can't accumulate. A real Read of the file:
 * or a successful edit: clears the counter via noteFileRead(), so enforcement
 * always starts fresh for the next independent blind edit. Mirrors the
 * module-level + TTL shape of bashRetryGuard.
 */

// Block a blind edit at most this many times per file before degrading to
// seeding. 2 → the model gets the "read first" error, can retry, gets it once
// more, then the third attempt is allowed through (loop broken).
const MAX_CONSECUTIVE_BLOCKS = 2;
const BLOCK_TTL_MS = 5 * 60_000; // 5 minutes

interface BlockEntry {
  count: number;
  lastAt: number;
}

const _blocks = new Map<string, BlockEntry>();

function purgeStale(now: number): void {
  for (const [key, entry] of _blocks) {
    if (now - entry.lastAt > BLOCK_TTL_MS) _blocks.delete(key);
  }
}

/**
 * Register a blind-edit block attempt for `filePath` and decide whether to keep
 * blocking. Returns true when the caller should BLOCK (return the read-first
 * error); false when the per-file block budget is exhausted and the caller
 * should instead seed-and-proceed to break a potential loop. Increments the
 * counter on every call, so each retried blind edit counts.
 */
export function shouldBlockUnreadEdit(
  filePath: string,
  now: number = Date.now(),
): boolean {
  purgeStale(now);
  const count = (_blocks.get(filePath)?.count ?? 0) + 1;
  if (count > MAX_CONSECUTIVE_BLOCKS) {
    // Budget exhausted: stop blocking and let the edit proceed (seeded). Clear
    // the entry so an unrelated later attempt on this file starts fresh.
    _blocks.delete(filePath);
    return false;
  }
  _blocks.set(filePath, { count, lastAt: now });
  return true;
}

/**
 * Clear the block counter for a file. Call when a real read-state exists for it
 * (the model read it, fully or windowed) or an edit succeeded, so a future blind
 * edit of the same file starts enforcement from zero.
 */
export function noteFileRead(filePath: string): void {
  _blocks.delete(filePath);
}

/** Reset all tracked state. For tests and context clears. */
export function resetReadFirstGuard(): void {
  _blocks.clear();
}
