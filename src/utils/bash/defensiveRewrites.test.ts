/**
 * Defensive bash command rewrites regression tests.
 *
 * Run: bun run src/utils/bash/defensiveRewrites.test.ts
 */

import {
  applyBashDefensiveRewrites,
  normalizeSmartQuotesOutsideQuotes,
  normalizeUnicodeSpacesOutsideQuotes,
  rewritePowerShellNullRedirect,
  rewriteWindowsCmdAutoRun,
  rewriteUnsafeGlobalNodeTaskkill,
  rewriteWindowsReservedRedirects,
  stripCommandGarbage,
} from './defensiveRewrites.js'

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e: any) {
    failed++
    console.log(`  FAIL ${name}: ${e?.message ?? String(e)}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, hint: string): void {
  if (actual !== expected) {
    throw new Error(`${hint}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  }
}

function assert(cond: unknown, hint: string): void {
  if (!cond) throw new Error(hint)
}

function main(): void {
  console.log('stripCommandGarbage:')

  test('removes CR from heredoc body so terminator matches', () => {
    const input = "cat <<EOF\r\nfoo\r\nEOF\r\n"
    const out = stripCommandGarbage(input)
    assertEqual(out, 'cat <<EOF\nfoo\nEOF\n', 'CR must be removed, LF kept')
  })

  test('preserves TAB and LF', () => {
    const input = 'echo\thello\nworld'
    assertEqual(stripCommandGarbage(input), 'echo\thello\nworld', 'TAB/LF must survive')
  })

  test('strips BOM at start of command', () => {
    const input = '﻿ls -la'
    assertEqual(stripCommandGarbage(input), 'ls -la', 'BOM must be removed')
  })

  test('strips zero-width space inserted by chat client', () => {
    const input = 'git​status'
    assertEqual(stripCommandGarbage(input), 'gitstatus', 'ZWSP must be removed')
  })

  test('strips NUL byte', () => {
    const input = 'echo\x00hi'
    assertEqual(stripCommandGarbage(input), 'echohi', 'NUL must be removed')
  })

  test('strips DEL', () => {
    const input = 'echo\x7fhi'
    assertEqual(stripCommandGarbage(input), 'echohi', 'DEL must be removed')
  })

  test('strips bidi marks and line separators', () => {
    const input = 'echo‪A B‮C'
    assertEqual(stripCommandGarbage(input), 'echoABC', 'bidi/sep must be removed')
  })

  test('does not touch literal backslash-r escape sequence', () => {
    // \r in source code is a two-char escape, not a CR byte
    const input = 'printf "foo\\rbar"'
    assertEqual(
      stripCommandGarbage(input),
      'printf "foo\\rbar"',
      'literal \\r escape must be preserved',
    )
  })

  test('plain ASCII command is unchanged', () => {
    const input = 'ls -la /tmp'
    assertEqual(stripCommandGarbage(input), 'ls -la /tmp', 'no false positives')
  })

  console.log('\nrewritePowerShellNullRedirect:')

  test("rewrites 2>$null to 2>/dev/null", () => {
    assertEqual(
      rewritePowerShellNullRedirect('cmd 2>$null'),
      'cmd 2>/dev/null',
      '2>$null must become 2>/dev/null',
    )
  })

  test('rewrites &>$null', () => {
    assertEqual(
      rewritePowerShellNullRedirect('cmd &>$null'),
      'cmd &>/dev/null',
      '&>$null must become &>/dev/null',
    )
  })

  test('rewrites >>$null', () => {
    assertEqual(
      rewritePowerShellNullRedirect('cmd >>$null'),
      'cmd >>/dev/null',
      '>>$null must become >>/dev/null',
    )
  })

  test("case-insensitive: 2>$NULL", () => {
    assertEqual(
      rewritePowerShellNullRedirect('cmd 2>$NULL'),
      'cmd 2>/dev/null',
      'uppercase $NULL must be matched',
    )
  })

  test('does NOT rewrite $null outside redirect position', () => {
    assertEqual(
      rewritePowerShellNullRedirect('echo $null'),
      'echo $null',
      '$null not in redirect must be left alone',
    )
  })

  test('does NOT rewrite $nullable (boundary check)', () => {
    assertEqual(
      rewritePowerShellNullRedirect('cmd 2>$nullable'),
      'cmd 2>$nullable',
      'must not match $nullable',
    )
  })

  console.log('\nrewriteWindowsReservedRedirects:')

  test('rewrites >con to >/dev/null', () => {
    assertEqual(
      rewriteWindowsReservedRedirects('cmd >con'),
      'cmd >/dev/null',
      '>con must be redirected',
    )
  })

  test('rewrites 2>prn case-insensitively', () => {
    assertEqual(
      rewriteWindowsReservedRedirects('cmd 2>PRN'),
      'cmd 2>/dev/null',
      'uppercase PRN must be matched',
    )
  })

  test('rewrites >>aux', () => {
    assertEqual(
      rewriteWindowsReservedRedirects('cmd >>aux'),
      'cmd >>/dev/null',
      '>>aux must be redirected',
    )
  })

  test('does NOT rewrite >con.txt', () => {
    assertEqual(
      rewriteWindowsReservedRedirects('cmd >con.txt'),
      'cmd >con.txt',
      'con.txt is not the reserved name',
    )
  })

  test('does NOT rewrite cat con (no redirect)', () => {
    assertEqual(
      rewriteWindowsReservedRedirects('cat con'),
      'cat con',
      'con not in redirect must be left alone',
    )
  })

  console.log('\nrewriteWindowsCmdAutoRun:')

  test('adds /d before cmd /c to disable AutoRun', () => {
    assertEqual(
      rewriteWindowsCmdAutoRun('cmd /c python test_model.py'),
      'cmd /d /c python test_model.py',
      'cmd /c must become cmd /d /c',
    )
  })

  test('adds /d before cmd.exe /s /c', () => {
    assertEqual(
      rewriteWindowsCmdAutoRun('cmd.exe /s /c echo hi'),
      'cmd.exe /d /s /c echo hi',
      'cmd.exe /s /c must gain /d',
    )
  })

  test('does NOT duplicate existing /d', () => {
    assertEqual(
      rewriteWindowsCmdAutoRun('cmd /d /c echo hi'),
      'cmd /d /c echo hi',
      'existing /d must be preserved',
    )
  })

  test('rewrites cmd after a command separator', () => {
    assertEqual(
      rewriteWindowsCmdAutoRun('echo before && cmd /c echo after'),
      'echo before && cmd /d /c echo after',
      'cmd segment after && must be rewritten',
    )
  })

  console.log('\nrewriteUnsafeGlobalNodeTaskkill:')

  test('blocks taskkill by node.exe image name and preserves later commands', () => {
    const input =
      'taskkill //IM node.exe //F 2>/dev/null; sleep 1; echo "killed"'
    const out = rewriteUnsafeGlobalNodeTaskkill(input)
    assert(
      out.includes('Blocked unsafe taskkill /IM node.exe'),
      'must emit an explicit block message',
    )
    assert(
      !out.includes('taskkill //IM node.exe //F'),
      'must remove the unsafe taskkill invocation',
    )
    assert(out.includes('sleep 1; echo "killed"'), 'later commands remain')
  })

  test('blocks case-insensitive taskkill.exe with quoted node image', () => {
    const input = 'taskkill.exe /F /IM "node.exe"'
    const out = rewriteUnsafeGlobalNodeTaskkill(input)
    assert(out.includes('Blocked unsafe taskkill /IM node.exe'), 'must block')
  })

  test('blocks imagename switch form', () => {
    const input = 'taskkill /imagename=node.exe /f'
    const out = rewriteUnsafeGlobalNodeTaskkill(input)
    assert(out.includes('Blocked unsafe taskkill /IM node.exe'), 'must block')
  })

  test('does NOT block PID-scoped taskkill', () => {
    const input = 'taskkill /PID 1234 /F'
    assertEqual(
      rewriteUnsafeGlobalNodeTaskkill(input),
      input,
      'PID-scoped cleanup must remain available',
    )
  })

  test('does NOT block other image names', () => {
    const input = 'taskkill //IM chrome.exe //F'
    assertEqual(
      rewriteUnsafeGlobalNodeTaskkill(input),
      input,
      'non-node image kills are outside this guard',
    )
  })

  test('does NOT rewrite an echoed taskkill string', () => {
    const input = 'echo "taskkill //IM node.exe //F"'
    assertEqual(
      rewriteUnsafeGlobalNodeTaskkill(input),
      input,
      'taskkill text inside another command must remain text',
    )
  })

  console.log('\nnormalizeUnicodeSpacesOutsideQuotes:')

  test('rewrites NBSP between tokens to a normal space', () => {
    assertEqual(
      normalizeUnicodeSpacesOutsideQuotes('echo hi'),
      'echo hi',
      'NBSP separator must become a real space',
    )
  })

  test('rewrites assorted Unicode spaces outside quotes', () => {
    // en-space, ideographic space, narrow NBSP
    assertEqual(
      normalizeUnicodeSpacesOutsideQuotes('a b　c d'),
      'a b c d',
      'all Unicode horizontal spaces must normalize outside quotes',
    )
  })

  test('preserves Unicode space INSIDE double quotes', () => {
    assertEqual(
      normalizeUnicodeSpacesOutsideQuotes('echo "a b"'),
      'echo "a b"',
      'intentional NBSP inside a string must be preserved',
    )
  })

  test('preserves Unicode space INSIDE single quotes', () => {
    assertEqual(
      normalizeUnicodeSpacesOutsideQuotes("echo 'a　b'"),
      "echo 'a　b'",
      'intentional Unicode space inside raw string must be preserved',
    )
  })

  test('plain ASCII command is untouched', () => {
    assertEqual(
      normalizeUnicodeSpacesOutsideQuotes('git status -sb'),
      'git status -sb',
      'no false positives on clean commands',
    )
  })

  test('idempotent', () => {
    const once = normalizeUnicodeSpacesOutsideQuotes('echo "keep this"')
    const twice = normalizeUnicodeSpacesOutsideQuotes(once)
    assertEqual(once, 'echo "keep this"', 'outside normalized, inside kept')
    assertEqual(twice, once, 'second pass is a no-op')
  })

  console.log('\nnormalizeSmartQuotesOutsideQuotes:')

  test('rewrites a balanced curly double-quote pair', () => {
    assertEqual(
      normalizeSmartQuotesOutsideQuotes('echo “hello world”'),
      'echo "hello world"',
      'curly double quotes must become ASCII double quotes',
    )
  })

  test('rewrites a balanced curly single-quote pair', () => {
    assertEqual(
      normalizeSmartQuotesOutsideQuotes('echo ‘hello’'),
      "echo 'hello'",
      'curly single quotes must become ASCII single quotes',
    )
  })

  test('SAFETY: leaves a lone stray curly quote (would unbalance) alone', () => {
    // One “ with no closing ” — converting would yield `echo "hi` (syntax err).
    assertEqual(
      normalizeSmartQuotesOutsideQuotes('echo “hi'),
      'echo “hi',
      'odd-count smart quotes must be left as literal (no fabricated syntax error)',
    )
  })

  test('SAFETY: reverts interleaving that would unbalance ASCII quotes', () => {
    // “ ‘ ” ’ → would become "'"' which leaves a dangling single quote.
    const input = '“‘”’'
    assertEqual(
      normalizeSmartQuotesOutsideQuotes(input),
      input,
      'balance-verify must revert an interleave that opens an unterminated quote',
    )
  })

  test('preserves a curly apostrophe INSIDE an ASCII double-quoted string', () => {
    assertEqual(
      normalizeSmartQuotesOutsideQuotes('git commit -m "it’s fixed"'),
      'git commit -m "it’s fixed"',
      'apostrophe inside a real string is content, not a delimiter',
    )
  })

  test('handles double and single pairs together', () => {
    assertEqual(
      normalizeSmartQuotesOutsideQuotes('echo “a” and ‘b’'),
      `echo "a" and 'b'`,
      'independently balanced pairs both convert and stay balanced',
    )
  })

  test('plain ASCII command is untouched', () => {
    assertEqual(
      normalizeSmartQuotesOutsideQuotes(`echo "a" 'b'`),
      `echo "a" 'b'`,
      'no false positives on clean ASCII quoting',
    )
  })

  test('idempotent', () => {
    const once = normalizeSmartQuotesOutsideQuotes('echo “hi”')
    const twice = normalizeSmartQuotesOutsideQuotes(once)
    assertEqual(once, 'echo "hi"', 'converted on first pass')
    assertEqual(twice, once, 'second pass is a no-op')
  })

  console.log('\napplyBashDefensiveRewrites:')

  test('composes all transforms in one pass', () => {
    const input = '﻿cat <<EOF\r\nfoo\r\nEOF\r\n && cmd 2>nul && cmd 2>$null && cmd >con'
    const expected =
      'cat <<EOF\nfoo\nEOF\n && cmd 2>/dev/null && cmd 2>/dev/null && cmd >/dev/null'
    assertEqual(applyBashDefensiveRewrites(input), expected, 'full pipeline')
  })

  test('idempotent: applying twice yields same result', () => {
    const input = 'cat <<EOF\r\nfoo\r\nEOF && cmd 2>$null'
    const once = applyBashDefensiveRewrites(input)
    const twice = applyBashDefensiveRewrites(once)
    assertEqual(once, twice, 'second pass must be a no-op')
  })

  test('adds cmd /d in the full pipeline', () => {
    assertEqual(
      applyBashDefensiveRewrites('cmd /c python test_model.py'),
      'cmd /d /c python test_model.py',
      'pipeline must disable Command Processor AutoRun',
    )
  })

  test('normalizes typography artifacts in the full pipeline', () => {
    // Leading BOM + curly quotes used as delimiters, outside any ASCII quote
    // → should yield clean, runnable bash after the composed rewrites.
    const input = '﻿echo “hi there” | grep hi'
    assertEqual(
      applyBashDefensiveRewrites(input),
      'echo "hi there" | grep hi',
      'BOM stripped and curly quotes ASCII-ified by the pipeline',
    )
  })

  test('typography pass keeps curly apostrophe inside a real string', () => {
    const input = 'git commit -m "fix: it’s done"'
    assertEqual(
      applyBashDefensiveRewrites(input),
      input,
      'in-string apostrophe must survive the full pipeline',
    )
  })

  test('does not break a clean command', () => {
    const input = 'rg --json "pattern" path/ | jq -r ".path.text"'
    assertEqual(applyBashDefensiveRewrites(input), input, 'clean command must pass through')
  })

  test('preserves heredoc body with intentional content', () => {
    const input = "python - <<'PY'\nprint('hi')\nPY"
    assertEqual(applyBashDefensiveRewrites(input), input, 'heredoc body untouched')
  })

  test('preserves jq filter with $ and special chars', () => {
    const input = `jq '.[] | select(.x != .y)' file.json`
    assertEqual(applyBashDefensiveRewrites(input), input, 'jq filter untouched')
  })

  test('preserves intentional bash $null variable read (not redirect)', () => {
    // someone setting and reading a `null` variable on purpose
    const input = 'null=/tmp/foo; echo "$null"'
    assert(
      applyBashDefensiveRewrites(input).includes('echo "$null"'),
      'variable read must not be rewritten',
    )
  })

  test('includes unsafe node.exe taskkill protection in the full pipeline', () => {
    const input = 'taskkill //IM node.exe //F 2>$null'
    const out = applyBashDefensiveRewrites(input)
    assert(
      out.includes('Blocked unsafe taskkill /IM node.exe'),
      'pipeline must block unsafe node image kills',
    )
    assert(!out.includes('2>$null'), 'pipeline still rewrites redirects first')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
