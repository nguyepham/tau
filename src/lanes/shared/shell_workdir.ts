/**
 * Shared contract for the "run this command in a directory" parameter on
 * lane-native shell tools.
 *
 * Background — the bug this prevents:
 * Lanes that hand-roll their built-in shell schema (codex `shell`, gemini
 * `run_shell_command`, cursor `run_terminal_cmd`/`Shell`) each decided
 * independently how to let the model pick a working directory. They
 * diverged badly:
 *   - codex omitted it entirely → the model literally could not express a
 *     directory, so it retried the same wrong-cwd command forever.
 *   - gemini/cursor exposed `dir_path`/`cwd` but translated it into a
 *     `cd <dir> && <command>` prefix.
 *
 * The shared Bash/PowerShell impls already have a first-class `workdir`
 * field that is strictly better than a cd-prefix:
 *   - quoting-safe (no hand-quoting paths with spaces; on Windows the
 *     backslashes in a `cd "C:\…"` prefix are bash escapes),
 *   - one-off — it does NOT change the session cwd (a synthesized
 *     `cd X && …` is treated by BashTool as a real shell move and
 *     persists the cwd, which is a surprising side effect),
 *   - understood by the workdir preflight + the cwd-transparency note.
 *
 * So the contract every lane shell tool must follow is:
 *   1. advertise a directory parameter in the schema the model sees, and
 *   2. map it to the shared impl's `workdir` field — never to a `cd …`.
 *
 * Lanes keep their NATIVE parameter name (the model was post-trained on
 * it); only the mapping target is standardized. New lanes should reuse
 * the helpers here so the contract can't drift again. The cross-lane test
 * in shell_workdir.test.ts enforces it.
 */

/** Model-facing description for the directory parameter. Shared so every
 *  lane describes the one-off, no-`cd` semantics identically. */
export const SHELL_WORKDIR_PARAM_DESCRIPTION =
  'Optional. Directory to run THIS command in — absolute, or relative to the session directory. '
  + 'Use this INSTEAD of `cd path && command`. It is a one-off: it does not change the session '
  + 'directory, so pass it again on the next command if you want to stay there.'

/**
 * JSON-Schema property fragment for a workdir-style directory parameter.
 * Spread into a shell tool's `properties` under the lane's native key,
 * e.g. `properties: { command: …, workdir: shellWorkdirSchemaProperty() }`.
 */
export function shellWorkdirSchemaProperty(
  description: string = SHELL_WORKDIR_PARAM_DESCRIPTION,
): Record<string, unknown> {
  return { type: 'string', description }
}

/**
 * Native key names lanes use for "the directory to run in". The shared
 * impl's own field (`workdir`) is listed first so an explicit workdir
 * always wins, followed by the per-lane aliases.
 */
export const SHELL_WORKDIR_INPUT_KEYS = [
  'workdir',
  'dir_path',
  'cwd',
  'directory',
] as const

/**
 * Copy the directory value from whichever native key the lane used onto
 * the shared impl's `workdir` field. Mutates and returns `out`.
 *
 * Never emits a `cd <dir> && …` prefix — that is the whole point. If no
 * directory key is present (or it is blank), `out` is returned unchanged.
 *
 * @param out    the shared-impl input being assembled (already has `command`).
 * @param native the model's raw tool-call arguments.
 * @param keys   candidate native key names, in priority order.
 */
export function applyShellWorkdir(
  out: Record<string, unknown>,
  native: Record<string, unknown>,
  keys: readonly string[] = SHELL_WORKDIR_INPUT_KEYS,
): Record<string, unknown> {
  for (const key of keys) {
    const value = native[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      out.workdir = value
      return out
    }
  }
  return out
}
