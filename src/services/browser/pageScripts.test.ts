/**
 * Tests for the pure page-processing helpers of the Browser tool: payload
 * pruning (token economy on huge pages) and blocker detection (CAPTCHA/login
 * walls). The in-page script STRINGS are exercised end-to-end by the CDP smoke
 * test against a real browser; here we cover the Node-side pure functions.
 *
 * Run: bun run src/services/browser/pageScripts.test.ts
 */

import {
  detectBlocker,
  prunePayloadElements,
  type InteractiveElement,
  type ObservedState,
} from './pageScripts.js'

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (error: unknown) {
    failed++
    console.log(
      `  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function assert(cond: boolean, hint: string): void {
  if (!cond) throw new Error(hint)
}

function el(over: Partial<InteractiveElement>): InteractiveElement {
  return {
    id: 0,
    tag: 'div',
    text: '',
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    ...over,
  }
}

function obs(over: Partial<ObservedState>): ObservedState {
  return {
    url: 'https://x.test/',
    title: '',
    text_sample: '',
    interactive_elements: [],
    ...over,
  }
}

function main(): void {
  console.log('prunePayloadElements:')

  test('caps very long text with an ellipsis', () => {
    const [out] = prunePayloadElements([el({ text: 'a'.repeat(200) })])
    assert(!!out && out.text.length <= 70, `capped length was ${out?.text.length}`)
    assert(!!out && out.text.endsWith('…'), 'should end with ellipsis')
  })

  test('collapses a run of >=6 identical elements', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      el({ id: i, tag: 'a', text: 'Item', x: i, y: 0 }),
    )
    const out = prunePayloadElements(many)
    assert(out.length < many.length, `expected fewer than ${many.length}, got ${out.length}`)
    assert(out.some(e => (e.repeatNote ?? 0) > 0), 'a representative should carry repeatNote')
  })

  test('keeps distinct adjacent list items (no over-merge)', () => {
    const items = [
      el({ id: 0, tag: 'a', text: 'Apple', x: 0, y: 0 }),
      el({ id: 1, tag: 'a', text: 'Banana', x: 0, y: 20 }),
      el({ id: 2, tag: 'a', text: 'Cherry', x: 0, y: 40 }),
    ]
    const out = prunePayloadElements(items)
    assert(out.length === 3, `distinct items must survive, got ${out.length}`)
  })

  test('merges parent/child duplicate at the same exact point', () => {
    const dup = [
      el({ id: 0, tag: 'div', text: 'Sign in', x: 100, y: 50 }),
      el({ id: 1, tag: 'button', text: 'Sign in', x: 100, y: 50 }),
    ]
    const out = prunePayloadElements(dup)
    assert(out.length === 1, `same-point duplicate should merge, got ${out.length}`)
  })

  test('preserves ref ids (no renumber) so gaps are intentional', () => {
    const items = [
      el({ id: 5, tag: 'a', text: 'X', x: 0, y: 0 }),
      el({ id: 9, tag: 'a', text: 'Y', x: 0, y: 20 }),
    ]
    const out = prunePayloadElements(items)
    assert(out[0]?.id === 5 && out[1]?.id === 9, 'ids must be preserved')
  })

  console.log('detectBlocker:')

  test('detects a CAPTCHA wall', () => {
    const b = detectBlocker(obs({ text_sample: 'Please verify you are human to continue' }))
    assert(b?.kind === 'captcha', 'should detect captcha')
  })

  test('detects "I am not a robot"', () => {
    const b = detectBlocker(obs({ text_sample: "confirm you're not a robot" }))
    assert(b?.kind === 'captcha', 'should detect captcha')
  })

  test('detects a login wall', () => {
    const b = detectBlocker(obs({ text_sample: 'You must be logged in to view this page' }))
    assert(b?.kind === 'login', 'should detect login')
  })

  test('does not false-positive on ordinary pages', () => {
    const b = detectBlocker(
      obs({ title: 'Dashboard', text_sample: 'Welcome back, here are your stats' }),
    )
    assert(b === null, 'ordinary page should not be flagged')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
