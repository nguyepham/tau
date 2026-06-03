import { rewriteWindowsNullRedirect } from './shellQuoting.js'

/**
 * Defensive byte-level rewrites on bash command strings, applied before the
 * command is quoted into `eval '...'`. Each transform targets a pattern that
 * is broken-as-bash and almost certainly hallucinated from another dialect
 * or pasted with formatting artifacts. Rewrites are pure, OS-independent,
 * and idempotent.
 *
 * Limitation shared with rewriteWindowsNullRedirect: the redirect regexes do
 * not parse shell quoting, so a literal `>nul` or `>$null` inside an echoed
 * string will also be rewritten. Accepted collateral: the broken-as-bash
 * variants are far more common than literal occurrences inside strings.
 *
 * Exception: the typography normalizers (Unicode spaces, smart quotes) ARE
 * quote-aware — they only touch text OUTSIDE ASCII-quoted spans, so an
 * intentional NBSP or curly quote inside `"..."`/`'...'` is preserved. The
 * smart-quote pass additionally reverts itself if the swap would leave an
 * ASCII quote unbalanced, so it can never turn a valid command into a
 * syntax error.
 */

/**
 * Strip control bytes and invisible Unicode that have no purpose in a bash
 * command. Preserves TAB (\x09) and LF (\x0A).
 *
 * CR (\x0D) is the most important target: when a heredoc body contains CRLF
 * line endings, the closing token becomes `EOF\r` and never matches `EOF` —
 * the command hangs forever waiting for an end marker that won't arrive.
 *
 * Invisible Unicode (ZWSP, joiners, bidi marks, BOM, interlinear annotations)
 * sneaks in via copy-paste from chat clients or formatted docs and breaks
 * tokenization without any visible cue in the source.
 *
 * Ranges:
 *   \x00-\x08      C0 control bytes (NUL..BS) excluding TAB
 *   \x0B-\x1F      VT, FF, CR, SO..US — everything between LF and space
 *   \x7F           DEL
 *   ​-‏  zero-width space/joiners + LRM/RLM
 *    -   line/paragraph separators
 *   ‪-‮  bidi format chars (LRE/RLE/PDF/LRO/RLO)
 *   ⁠-⁯  invisible operators + deprecated format chars
 *   ﻿         BOM / zero-width no-break space
 *   ￹-￻  interlinear annotation anchor/separator/terminator
 *
 * Source is kept 100% ASCII via the RegExp constructor with \u escapes so
 * no editor or transport can mangle the literal control/invisible chars.
 */
const COMMAND_GARBAGE_REGEX = new RegExp(
  '[' +
    '\\x00-\\x08' +
    '\\x0b-\\x1f' +
    '\\x7f' +
    '\\u200B-\\u200F' +
    '\\u2028-\\u2029' +
    '\\u202A-\\u202E' +
    '\\u2060-\\u206F' +
    '\\uFEFF' +
    '\\uFFF9-\\uFFFB' +
    ']',
  'g',
)

export function stripCommandGarbage(command: string): string {
  return command.replace(COMMAND_GARBAGE_REGEX, '')
}

/**
 * Walk a command with bash quote-removal semantics and report, for every
 * index, whether that position lies inside an ASCII single- or double-quoted
 * span. Also reports whether the string ENDS while a quote is still open
 * (i.e. an unterminated quote — a syntax error in the eventual `eval`).
 *
 * The quote-delimiter chars themselves are marked in-quote so a normalizer
 * never rewrites a delimiter. Bash rules honored:
 *   - single quotes: everything literal until the next `'` (no escapes)
 *   - double quotes: `\"` and `\\` keep their following char inside the span
 *   - unquoted: `\` escapes the next char (so `\"` is NOT a quote opener)
 *
 * Pure and OS-independent. Used only by the typography normalizers below to
 * gate edits to unquoted regions; it makes no security decision.
 */
function scanAsciiQuotes(command: string): { mask: boolean[]; open: boolean } {
  const mask = new Array<boolean>(command.length).fill(false)
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (inSingle) {
      mask[i] = true
      if (c === "'") inSingle = false
      continue
    }
    if (inDouble) {
      mask[i] = true
      if (c === '\\' && (command[i + 1] === '"' || command[i + 1] === '\\')) {
        // Escaped " or \ stays inside the double-quoted span — consume both.
        i++
        if (i < command.length) mask[i] = true
        continue
      }
      if (c === '"') inDouble = false
      continue
    }
    // Unquoted context.
    if (c === '\\' && i + 1 < command.length) {
      // Backslash escapes the next char; neither is a quote delimiter.
      i++
      continue
    }
    if (c === "'") {
      inSingle = true
      mask[i] = true
    } else if (c === '"') {
      inDouble = true
      mask[i] = true
    }
  }
  return { mask, open: inSingle || inDouble }
}

/**
 * Unicode horizontal whitespace that bash does NOT treat as a word separator
 * (it splits only on $IFS — space/tab/newline). Pasted from rich text or
 * emitted by some keyboards/LLM tokenizers, an NBSP between two tokens fuses
 * them into one literal word (`echo<NBSP>hi` → command `echo hi` not found).
 *
 * Range excludes the zero-width and bidi chars (​-‏,  - )
 * already removed by stripCommandGarbage, and is built via the RegExp
 * constructor with \u escapes so the source stays 100% ASCII.
 *
 *      NBSP               Ogham space
 *    -   en/em/thin/hair spaces (zero-width ​ is excluded)
 *      narrow NBSP        medium math space    　  ideographic
 */
const UNICODE_SPACE_REGEX = new RegExp(
  '[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]',
)

/**
 * Replace Unicode spaces with a regular space, but ONLY outside ASCII-quoted
 * spans. Outside quotes a Unicode space can only be a (broken) word boundary,
 * so converting it to a real separator restores the obvious intent and can
 * never change quote/paren/brace balance — i.e. it cannot introduce a syntax
 * error. Inside quotes the char may be intentional content, so it is left as
 * is. Idempotent: a second pass finds nothing to change outside quotes.
 */
export function normalizeUnicodeSpacesOutsideQuotes(command: string): string {
  // Fast path: skip the per-char walk for the overwhelming ASCII-only case.
  if (!UNICODE_SPACE_REGEX.test(command)) return command
  const { mask } = scanAsciiQuotes(command)
  let out = ''
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    out += !mask[i] && UNICODE_SPACE_REGEX.test(c) ? ' ' : c
  }
  return out
}

// Typographic ("smart"/curly) quotes produced by autocorrect, word
// processors, and chat clients. As bash word characters they are literal,
// so `echo “hi”` prints the curly quotes instead of grouping an argument.
// Built from code points (not literal curly chars) so re-saving this file
// under a different encoding — or a tool that "helpfully" normalizes quotes —
// cannot silently change what we match. Same ASCII-source discipline as
// COMMAND_GARBAGE_REGEX above. U+201C/U+201D = “ ”; U+2018/U+2019 = ‘ ’.
const SMART_DOUBLE_QUOTES = String.fromCharCode(0x201c, 0x201d)
const SMART_SINGLE_QUOTES = String.fromCharCode(0x2018, 0x2019)

/**
 * Replace smart double/single quotes with their ASCII equivalents so they act
 * as real delimiters — but only OUTSIDE existing ASCII-quoted spans, and only
 * when the result stays syntactically balanced. Two safety rails make this
 * incapable of turning a valid command into a broken one:
 *
 *  1. Quote-awareness: a smart quote inside `"..."`/`'...'` is intentional
 *     content (e.g. an apostrophe in `"it’s fine"`) and is left untouched.
 *
 *  2. Balance verification: we build the candidate, then re-scan it; if the
 *     swap left an ASCII quote unterminated (e.g. a lone stray `“`, or smart
 *     quotes that interleave into `"'"'`), we discard the candidate and
 *     return the original. The original passed `bash -n` as literal curly
 *     chars, so reverting preserves its valid (if cosmetically wrong)
 *     behavior rather than risking a fabricated `unexpected EOF`.
 *
 * Per-type even-count gating short-circuits the common unbalanced case early
 * (an odd number of outside-quote smart quotes can't pair up). Pure,
 * OS-independent, idempotent.
 */
export function normalizeSmartQuotesOutsideQuotes(command: string): string {
  // Fast path: nothing to do without at least one smart quote char.
  let hasSmart = false
  for (const ch of SMART_DOUBLE_QUOTES + SMART_SINGLE_QUOTES) {
    if (command.includes(ch)) {
      hasSmart = true
      break
    }
  }
  if (!hasSmart) return command

  const { mask } = scanAsciiQuotes(command)

  // Count outside-quote occurrences per type. An odd count cannot form
  // balanced ASCII pairs, so we skip converting that type entirely.
  let doubles = 0
  let singles = 0
  for (let i = 0; i < command.length; i++) {
    if (mask[i]) continue
    const c = command[i]!
    if (SMART_DOUBLE_QUOTES.includes(c)) doubles++
    else if (SMART_SINGLE_QUOTES.includes(c)) singles++
  }
  const convertDoubles = doubles > 0 && doubles % 2 === 0
  const convertSingles = singles > 0 && singles % 2 === 0
  if (!convertDoubles && !convertSingles) return command

  let candidate = ''
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (!mask[i] && convertDoubles && SMART_DOUBLE_QUOTES.includes(c)) {
      candidate += '"'
    } else if (!mask[i] && convertSingles && SMART_SINGLE_QUOTES.includes(c)) {
      candidate += "'"
    } else {
      candidate += c
    }
  }

  // Rail #2: never emit a command whose ASCII quotes are left unbalanced.
  return scanAsciiQuotes(candidate).open ? command : candidate
}

/**
 * Rewrite PowerShell-style `$null` redirects to `/dev/null`. Mirrors the
 * existing `>nul` rewrite for the `$null` variable form the model emits
 * when its training surfaces PowerShell idioms inside a bash command.
 *
 * In bash, `$null` is an unset variable that expands to empty, producing
 * an "ambiguous redirect" error. Rewriting only repairs broken-as-bash.
 */
const PS_NULL_REDIRECT_REGEX = /(\d?&?>+\s*)\$null(?=\s|$|[|&;)\n])/gi

export function rewritePowerShellNullRedirect(command: string): string {
  return command.replace(PS_NULL_REDIRECT_REGEX, '$1/dev/null')
}

/**
 * Rewrite redirects to Windows reserved device names (con, prn, aux) to
 * `/dev/null`. Writing to these names on Windows creates undeletable files
 * that break `git add .` and `git clone`, in the same way `nul` does.
 *
 * Same redirect-position regex shape as rewriteWindowsNullRedirect — only
 * fires when the name appears as a redirect target, not as a filename
 * fragment like `con.txt` or `auxiliary.log`.
 */
const RESERVED_REDIRECT_REGEX =
  /(\d?&?>+\s*)(?:con|prn|aux)(?=\s|$|[|&;)\n])/gi

export function rewriteWindowsReservedRedirects(command: string): string {
  return command.replace(RESERVED_REDIRECT_REGEX, '$1/dev/null')
}

const CMD_AUTORUN_SEGMENT_REGEX =
  /(^|(?:;|&&|\|\||\||\n|\()\s*)(cmd(?:\.exe)?)(?=\s+(?:(?:\/[a-z])\s+)*\/[cs]\b)(?![^\n;&|()]*\s\/d\b)/gi

/**
 * Add `cmd.exe /d` when a Bash command explicitly shells out through
 * Windows Command Processor. `/d` disables Command Processor AutoRun hooks
 * (Clink, Visual Studio probes, banners, etc.) so startup noise cannot appear
 * before the command's real output.
 */
export function rewriteWindowsCmdAutoRun(command: string): string {
  return command.replace(
    CMD_AUTORUN_SEGMENT_REGEX,
    (_match: string, prefix: string, executable: string) =>
      `${prefix}${executable} /d`,
  )
}

const UNSAFE_NODE_TASKKILL_SEGMENT_REGEX =
  /(^|(?:;|&&|\|\||\n)[ \t]*)([ \t]*taskkill(?:\.exe)?\b(?:(?!(?:;|&&|\|\||\n)).)*)/gi

const TASKKILL_NODE_IMAGE_REGEX =
  /(?:^|\s)(?:\/{1,2}|-)(?:im|imagename)(?:\s+|=)(?:"node\.exe"|'node\.exe'|node\.exe)(?=\s|$)/i

const BLOCKED_NODE_TASKKILL_COMMAND =
  "(printf '%s\\n' 'Blocked unsafe taskkill /IM node.exe; stop the specific dev server PID or port instead.' >&2 && false)"

/**
 * Block broad Windows process kills that target every `node.exe` by image
 * name. On Windows the CLI itself, MCP helpers, frontend dev servers, and
 * package scripts commonly all run as node.exe, so `taskkill /IM node.exe /F`
 * can terminate the active session instead of only cleaning up a project
 * server. PID-scoped taskkill commands are intentionally left alone.
 */
export function rewriteUnsafeGlobalNodeTaskkill(command: string): string {
  return command.replace(
    UNSAFE_NODE_TASKKILL_SEGMENT_REGEX,
    (match: string, prefix: string, segment: string) => {
      if (!TASKKILL_NODE_IMAGE_REGEX.test(segment)) return match
      return `${prefix}${BLOCKED_NODE_TASKKILL_COMMAND}`
    },
  )
}

/**
 * Compose every defensive rewrite into a single entry point. Order matters:
 * garbage-strip first (so subsequent passes see clean text with zero-width
 * and control bytes already gone), then the quote-aware typography
 * normalizers (which depend on accurate ASCII-quote scanning), then the
 * dialect/redirect rewrites.
 */
export function applyBashDefensiveRewrites(command: string): string {
  let out = command
  out = stripCommandGarbage(out)
  out = normalizeUnicodeSpacesOutsideQuotes(out)
  out = normalizeSmartQuotesOutsideQuotes(out)
  out = rewriteWindowsNullRedirect(out)
  out = rewritePowerShellNullRedirect(out)
  out = rewriteWindowsReservedRedirects(out)
  out = rewriteWindowsCmdAutoRun(out)
  out = rewriteUnsafeGlobalNodeTaskkill(out)
  return out
}
