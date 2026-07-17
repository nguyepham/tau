/** Focused regression tests for vendored-ripgrep compatibility probing. */

import { isUsableRipgrep } from './ripgrepBinary.js'

let passed = 0
let failed = 0

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function test(name: string, run: () => void) {
  try {
    run()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.error(
      `  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

console.log('ripgrep binary compatibility:')

test('rejects a missing vendored binary without spawning it', () => {
  let spawned = false
  const usable = isUsableRipgrep('/missing/rg', {
    fileExists: () => false,
    spawnSyncImpl: (() => {
      spawned = true
      throw new Error('must not spawn')
    }) as never,
  })
  assert(!usable, 'missing binary was accepted')
  assert(!spawned, 'missing binary was executed')
})

test('rejects an incompatible binary and allows system-rg fallback', () => {
  const usable = isUsableRipgrep('/vendor/rg', {
    fileExists: () => true,
    spawnSyncImpl: (() => ({
      status: null,
      stdout: '',
      error: Object.assign(new Error('not found'), { code: 'ENOENT' }),
    })) as never,
  })
  assert(!usable, 'incompatible binary was accepted')
})

test('accepts only a successful ripgrep version probe', () => {
  const usable = isUsableRipgrep('/vendor/rg', {
    fileExists: () => true,
    spawnSyncImpl: (() => ({
      status: 0,
      stdout: 'ripgrep 14.1.1\n',
    })) as never,
  })
  assert(usable, 'working ripgrep binary was rejected')

  const impostor = isUsableRipgrep('/vendor/rg', {
    fileExists: () => true,
    spawnSyncImpl: (() => ({ status: 0, stdout: 'not-ripgrep\n' })) as never,
  })
  assert(!impostor, 'unrelated executable was accepted as ripgrep')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
