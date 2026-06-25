import { rewriteUnquotedUrlAmpersand } from "../../utils/bash/defensiveRewrites.js";

/**
 * Detect commands that detach a process with a raw `&`.
 *
 * Detached processes are invisible to Zen's task tracking — they cannot be
 * listed or stopped later, and they keep holding ports and file locks (the
 * classic source of "Device or resource busy" retry loops when the model
 * later tries to restart a server or delete its database).
 * `run_in_background` gives the same concurrency with a tracked, killable
 * task, so a raw `&` is blocked with that redirection.
 *
 * Conservative by design — false blocks are worse than misses:
 * - bails out entirely on heredocs (their bodies may legitimately contain `&`)
 * - ignores `&` inside single- or double-quoted strings
 * - ignores `&&`, `|&`, and redirection forms (`2>&1`, `&>`, `<&`)
 * - allows job-control parallelism that reaps its jobs with `wait`
 */
export function detectDetachedBackgroundPattern(
  command: string,
): string | null {
  // A `&` that is part of a URL query string (`?a=1&b=2`) is auto-quoted at
  // execution time (applyBashDefensiveRewrites → rewriteUnquotedUrlAmpersand), so
  // apply the same rewrite here first: the quoted URL is then stripped below and
  // never read as a background operator. A real trailing background `&` survives.
  command = rewriteUnquotedUrlAmpersand(command);

  // Heredoc bodies may contain `&` as data (e.g. writing a script); skip the
  // whole check rather than risk a false block.
  if (/<<-?\s*['"]?\w+/.test(command)) return null;

  // Strip quoted segments so `echo "fish & chips"` is not flagged.
  const stripped = command
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');

  // `wait` reaps the background jobs before the command returns — that is
  // intentional in-command parallelism, nothing stays detached.
  if (/(^|[\s;&|(])wait([\s;)]|$)/.test(stripped)) return null;

  // A background `&`: not `&&`, not `|&`, not redirection (`>&`, `&>`, `<&`).
  if (!/(?<![&><|])&(?![&>])/.test(stripped)) return null;

  return "this command detaches a process with a raw `&`";
}

function hasUnquotedForegroundStdinTopology(command: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < command.length; index++) {
    const char = command[index]!;
    if (inSingle) {
      if (char === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (char === "\\" && index + 1 < command.length) {
        index++;
        continue;
      }
      if (char === '"') inDouble = false;
      continue;
    }
    if (char === "\\" && index + 1 < command.length) {
      index++;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      continue;
    }

    if (
      char === "|" &&
      command[index - 1] !== "|" &&
      command[index + 1] !== "|" &&
      command[index + 1] !== "&"
    ) {
      return true;
    }
    if (char === "<") {
      // Input redirects, heredocs/here-strings, and process substitution all
      // couple the foreground shell to an input producer/descriptor.
      return true;
    }
  }
  return false;
}

/**
 * Automatic backgrounding is safe only for commands whose lifecycle is not
 * coupled to foreground stdin. Moving a pipeline/heredoc/input redirect to the
 * task system mid-flight can sever or outlive its producer and make a finite
 * command appear hung. Explicit run_in_background remains available.
 */
export function allowsAutomaticBackgrounding(command: string): boolean {
  const trimmed = command.trim();
  const firstWord = /^[A-Za-z_][A-Za-z0-9_]*=(?:\S+)\s+/.test(trimmed)
    ? trimmed
        .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, "")
        .split(/\s+/)[0]
    : trimmed.split(/\s+/)[0];

  if (firstWord === "sleep") return false;
  return !hasUnquotedForegroundStdinTopology(command);
}
