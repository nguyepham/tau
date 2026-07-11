/**
 * Skeleton read checks (tree-sitter WASM structural elision).
 *
 * Run via: bun run src/tools/FileReadTool/skeleton.test.ts
 */

import {
  buildSkeleton,
  fileReadTokenLimitAdvice,
  getAutoSkeletonMinBytes,
  isAutoSkeletonEnabled,
  isSkeletonSupportedExt,
} from './skeleton.js'

let passed = 0
let failed = 0

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++
      console.log(`  ok  ${name}`)
    })
    .catch((e: any) => {
      failed++
      console.log(`  FAIL ${name}: ${e?.message ?? String(e)}`)
    })
}

function assert(cond: unknown, hint: string): void {
  if (!cond) throw new Error(hint)
}

/** Plain formatter mirroring the production addLineNumbers shape. */
const fmt = (content: string, startLine: number) =>
  content
    .split('\n')
    .map((l, i) => `${String(i + startLine).padStart(6, ' ')}→${l}`)
    .join('\n')

const TS_SAMPLE = [
  "import { readFile } from 'fs/promises'", // 1
  '', // 2
  'export type Config = {', // 3
  '  name: string', // 4
  '}', // 5
  '', // 6
  'export function longFunction(input: string): number {', // 7
  '  const a = 1', // 8..15 (8 body lines)
  '  const b = 2',
  '  const c = 3',
  '  const d = 4',
  '  const e = 5',
  '  const f = 6',
  '  const g = 7',
  '  return a + b + c + d + e + f + g',
  '}', // 16
  '', // 17
  'export const short = (x: number) => {', // 18
  '  return x * 2', // 19
  '}', // 20
  '',
].join('\n')

await test('supported extensions are reported', () => {
  assert(isSkeletonSupportedExt('ts'), 'ts should be supported')
  assert(isSkeletonSupportedExt('py'), 'py should be supported')
  assert(!isSkeletonSupportedExt('md'), 'md should not be supported')
  assert(!isSkeletonSupportedExt('json'), 'json should not be supported')
})

await test('unsupported extension returns null', async () => {
  const result = await buildSkeleton('# heading\n'.repeat(50), 'md', fmt)
  assert(result === null, 'expected null')
})

await test('long ts body is elided, short body and signatures stay', async () => {
  const result = await buildSkeleton(TS_SAMPLE, 'ts', fmt)
  assert(result !== null, 'expected a skeleton')
  const text = result!.formatted
  assert(text.includes('export function longFunction'), 'missing signature')
  assert(text.includes('export type Config'), 'missing type')
  assert(!text.includes('return a + b + c'), 'body leaked')
  assert(text.includes('return x * 2'), 'short body should stay inline')
  assert(text.includes('[body elided: lines 8-15 (8 lines) — Read with offset=8 & limit=8 to expand]'), text)
  // Brace lines survive with their true numbers.
  assert(/ {4}16→\}/.test(text), 'closing brace line lost')
  assert(result!.elidedRegions === 1, String(result!.elidedRegions))
  assert(result!.elidedLines === 8, String(result!.elidedLines))
  assert(result!.totalLines === 21, String(result!.totalLines))
})

await test('file with only short bodies returns null (fall back to full read)', async () => {
  const short = ['function a() {', '  return 1', '}', 'function b() {', '  return 2', '}', ''].join('\n')
  const result = await buildSkeleton(short, 'ts', fmt)
  assert(result === null, 'expected null')
})

await test('python def blocks elide including the block (no braces)', async () => {
  const py = [
    'import os', // 1
    '', // 2
    'def long_fn(x):', // 3
    '    a = 1', // 4
    '    b = 2',
    '    c = 3',
    '    d = 4',
    '    e = 5',
    '    return a + b + c + d + e', // 9
    '', // 10
    'class Widget:', // 11
    '    def render(self):', // 12
    '        line1 = 1', // 13
    '        line2 = 2',
    '        line3 = 3',
    '        line4 = 4',
    '        line5 = 5',
    '        return line1', // 18
    '',
  ].join('\n')
  const result = await buildSkeleton(py, 'py', fmt)
  assert(result !== null, 'expected a skeleton')
  const text = result!.formatted
  assert(text.includes('def long_fn(x):'), 'def line missing')
  assert(text.includes('class Widget:'), 'class line missing')
  assert(text.includes('def render(self):'), 'method signature missing')
  assert(!text.includes('a = 1'), 'python body leaked')
  assert(!text.includes('line3 = 3'), 'method body leaked')
  assert(result!.elidedRegions === 2, String(result!.elidedRegions))
})

await test('line numbers in kept runs are the real file line numbers', async () => {
  const result = await buildSkeleton(TS_SAMPLE, 'ts', fmt)
  const text = result!.formatted
  assert(/ {5}1→import \{ readFile \}/.test(text), 'line 1 misnumbered')
  assert(/ {4}18→export const short/.test(text), 'line 18 misnumbered')
})

await test('deterministic across calls', async () => {
  const a = await buildSkeleton(TS_SAMPLE, 'ts', fmt)
  const b = await buildSkeleton(TS_SAMPLE, 'ts', fmt)
  assert(a !== null && b !== null, 'expected skeletons')
  assert(a!.formatted === b!.formatted, 'nondeterministic output')
})

// --- Overlong kept lines (inline sourcemaps, minified code, data URIs) ------
//
// Eliding bodies cuts lines, not bytes: a single 113KB sourcemap comment
// survived elision and blew the Read token cap. Kept lines past 500 chars are
// truncated; lines up to 700 are left intact so the marker never costs more
// than it saves.

await test('overlong kept line is truncated with a char-count marker', async () => {
  // '// ' + 2000 x's = 2003 chars. Head keeps 500, so 1503 are dropped.
  const result = await buildSkeleton(TS_SAMPLE + `// ${'x'.repeat(2000)}\n`, 'ts', fmt)
  assert(result !== null, 'expected a skeleton')
  const text = result!.formatted
  assert(result!.truncatedLines === 1, String(result!.truncatedLines))
  assert(result!.truncatedChars === 1503, String(result!.truncatedChars))
  assert(text.includes('[+1503 chars elided from this line]'), 'marker missing')
  assert(!text.includes('x'.repeat(600)), 'long line leaked past the cap')
  // Real line number survives, and exactly 497 x's follow the '// ' prefix.
  assert(
    / {4}21→\/\/ x{497} … \[\+1503 chars elided from this line\]/.test(text),
    'truncated line lost its real line number or cut at the wrong offset',
  )
  // The body elision still happened; truncation is additive, not a substitute.
  assert(result!.elidedRegions === 1, String(result!.elidedRegions))
})

await test('line just over the cap is left intact (marker would not pay)', async () => {
  const line = `// ${'y'.repeat(597)}` // 600 chars: over 500, under 500+200
  const result = await buildSkeleton(TS_SAMPLE + line + '\n', 'ts', fmt)
  assert(result !== null, 'expected a skeleton')
  assert(result!.truncatedLines === 0, String(result!.truncatedLines))
  assert(result!.truncatedChars === 0, String(result!.truncatedChars))
  assert(result!.formatted.includes(line), 'intact line was mangled')
})

await test('file with no elidable body but an overlong line still skeletonizes', async () => {
  const src = [`const data = "${'z'.repeat(1500)}"`, 'export const x = 1', ''].join('\n')
  const result = await buildSkeleton(src, 'ts', fmt)
  assert(result !== null, 'expected a skeleton, not a fall-back to full read')
  assert(result!.elidedRegions === 0, String(result!.elidedRegions))
  assert(result!.elidedLines === 0, String(result!.elidedLines))
  assert(result!.truncatedLines === 1, String(result!.truncatedLines))
  assert(result!.formatted.includes('chars elided from this line'), 'marker missing')
  assert(result!.formatted.includes('export const x = 1'), 'short line dropped')
})

await test('truncation never splits a surrogate pair', async () => {
  // '// ' (3) + 496 a's puts the emoji's lead surrogate exactly at index 499,
  // so a naive slice(0, 500) would emit a lone high surrogate.
  const line = `// ${'a'.repeat(496)}😀${'b'.repeat(1000)}`
  const result = await buildSkeleton(TS_SAMPLE + line + '\n', 'ts', fmt)
  assert(result !== null, 'expected a skeleton')
  const text = result!.formatted
  assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), 'lone high surrogate emitted')
  assert(!/(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text), 'lone low surrogate emitted')
  assert(!text.includes('😀'), 'emoji should fall past the 499-char cut')
  assert(result!.truncatedChars === 1002, String(result!.truncatedChars))
})

await test('overlong line inside an elided body is not counted as truncated', async () => {
  const src = [
    'export function f(): number {',
    `  const a = '${'q'.repeat(2000)}'`,
    '  const b = 2',
    '  const c = 3',
    '  const d = 4',
    '  const e = 5',
    '  const g = 6',
    '  return b',
    '}',
    '',
  ].join('\n')
  const result = await buildSkeleton(src, 'ts', fmt)
  assert(result !== null, 'expected a skeleton')
  assert(result!.elidedRegions === 1, String(result!.elidedRegions))
  assert(result!.truncatedLines === 0, 'body line was already elided, not truncated')
  assert(!result!.formatted.includes('q'.repeat(50)), 'elided body leaked')
})

await test('deterministic across calls with truncation', async () => {
  const src = TS_SAMPLE + `// ${'x'.repeat(2000)}\n`
  const a = await buildSkeleton(src, 'ts', fmt)
  const b = await buildSkeleton(src, 'ts', fmt)
  assert(a !== null && b !== null, 'expected skeletons')
  assert(a!.formatted === b!.formatted, 'nondeterministic output')
})

// --- Token-limit advice + loop guard ----------------------------------------
//
// When a Read overflows the token cap, the error advises skeleton mode — but
// only when skeleton was NOT already tried, or the model would loop by
// retrying the same failing mode. The gate is the REQUESTED flag: all three
// skeleton outcomes (output still too big / produced nothing / unsupported)
// re-enter this advice with skeletonRequested=true and must not re-suggest.

const mentionsSkeleton = (s: string) => /skeleton: true/.test(s)

await test('advice suggests skeleton for a supported file on a non-skeleton read', () => {
  assert(mentionsSkeleton(fileReadTokenLimitAdvice('ts', false)), 'ts should suggest skeleton')
  assert(mentionsSkeleton(fileReadTokenLimitAdvice('tsx', false)), 'tsx should suggest skeleton')
  assert(mentionsSkeleton(fileReadTokenLimitAdvice('py', false)), 'py should suggest skeleton')
})

await test('loop guard: a skeleton read that overflows never re-suggests skeleton', () => {
  // Scenario 1 (skeleton output still too big) and 2 (skeleton produced
  // nothing → full-read fall-through) both arrive here with requested=true.
  assert(!mentionsSkeleton(fileReadTokenLimitAdvice('ts', true)), 'ts+requested must not loop')
  assert(!mentionsSkeleton(fileReadTokenLimitAdvice('tsx', true)), 'tsx+requested must not loop')
})

await test('loop guard: unsupported ext never suggests skeleton, either way', () => {
  // Scenario 3: skeleton requested on .md falls through to a full read.
  assert(!mentionsSkeleton(fileReadTokenLimitAdvice('md', false)), 'md must not suggest skeleton')
  assert(!mentionsSkeleton(fileReadTokenLimitAdvice('md', true)), 'md+requested must not suggest')
  assert(!mentionsSkeleton(fileReadTokenLimitAdvice('json', false)), 'json must not suggest skeleton')
})

await test('advice always keeps the offset/limit + search guidance', () => {
  for (const [ext, req] of [['ts', false], ['ts', true], ['md', false]] as const) {
    const advice = fileReadTokenLimitAdvice(ext, req)
    assert(/offset/.test(advice) && /limit/.test(advice), `missing offset/limit for ${ext}/${req}`)
    assert(/search/.test(advice), `missing search guidance for ${ext}/${req}`)
  }
})

await test('advice is deterministic', () => {
  assert(
    fileReadTokenLimitAdvice('ts', false) === fileReadTokenLimitAdvice('ts', false),
    'nondeterministic advice',
  )
})

function resetAutoSkeletonEnv(): void {
  delete process.env.TAU_AUTO_SKELETON
  delete process.env.CLAUDE_CODE_AUTO_SKELETON
  delete process.env.TAU_AUTO_SKELETON_MIN_BYTES
  delete process.env.CLAUDE_CODE_AUTO_SKELETON_MIN_BYTES
}

await test('auto-skeleton defaults on and 0/false/off/no disables it', () => {
  resetAutoSkeletonEnv()
  assert(isAutoSkeletonEnabled(), 'should default on')
  for (const off of ['0', 'false', 'off', 'no']) {
    process.env.TAU_AUTO_SKELETON = off
    assert(!isAutoSkeletonEnabled(), `'${off}' should disable`)
  }
  process.env.TAU_AUTO_SKELETON = '1'
  assert(isAutoSkeletonEnabled(), "'1' must not disable")
  resetAutoSkeletonEnv()
  process.env.CLAUDE_CODE_AUTO_SKELETON = 'off'
  assert(!isAutoSkeletonEnabled(), 'CLAUDE_CODE_ key should also disable')
  resetAutoSkeletonEnv()
})

await test('auto-skeleton min-bytes floor: default, valid override, invalid ignored', () => {
  resetAutoSkeletonEnv()
  assert(getAutoSkeletonMinBytes() === 16_000, 'default floor should be 16000')
  process.env.TAU_AUTO_SKELETON_MIN_BYTES = '40000'
  assert(getAutoSkeletonMinBytes() === 40_000, 'valid override should win')
  process.env.TAU_AUTO_SKELETON_MIN_BYTES = '-5'
  assert(getAutoSkeletonMinBytes() === 16_000, 'negative override ignored')
  process.env.TAU_AUTO_SKELETON_MIN_BYTES = 'huge'
  assert(getAutoSkeletonMinBytes() === 16_000, 'non-numeric override ignored')
  resetAutoSkeletonEnv()
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
