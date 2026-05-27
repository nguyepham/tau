/**
 * Bash failure guidance unit tests.
 *
 * Run: bun run src/tools/BashTool/bashFailureGuidance.test.ts
 */

import {
  appendBashFailureGuidance,
  buildBashFailureGuidance,
} from './bashFailureGuidance.js'

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

function assert(cond: unknown, hint: string): void {
  if (!cond) throw new Error(hint)
}

function main(): void {
  console.log('bash failure guidance:')

  test('treats command-only output as no diagnostic output', () => {
    const command = 'docker exec namenode hdfs dfs -ls /'
    const guidance = buildBashFailureGuidance(command, 1, command)

    assert(
      guidance.includes('without diagnostic output'),
      `expected no-diagnostic guidance, got: ${guidance}`,
    )
    assert(
      guidance.includes('Do not retry near-identical commands'),
      'expected retry-loop guidance',
    )
  })

  test('classifies missing file diagnostics generically', () => {
    const guidance = buildBashFailureGuidance(
      'cat /missing/file',
      1,
      'cat: /missing/file: No such file or directory',
    )

    assert(
      guidance.includes('not found'),
      `expected not-found reason, got: ${guidance}`,
    )
    assert(
      guidance.includes('List the parent location'),
      'expected diagnostic next step',
    )
  })

  test('classifies runtime output encoding failures', () => {
    const guidance = buildBashFailureGuidance(
      'python read_pdf.py',
      1,
      "UnicodeEncodeError: 'charmap' codec can't encode character '\\u202f'",
    )

    assert(
      guidance.includes('encoding text for stdout or stderr'),
      `expected encoding reason, got: ${guidance}`,
    )
    assert(
      guidance.includes('PYTHONIOENCODING=utf-8'),
      'expected Python UTF-8 guidance',
    )
  })

  test('adds Python-specific diagnostics when output is missing', () => {
    const command = 'python read_pdf.py'
    const guidance = buildBashFailureGuidance(command, 1, command)

    assert(
      guidance.includes('sys.stdout.encoding'),
      `expected Python encoding diagnostic guidance, got: ${guidance}`,
    )
  })

  test('adds pipeline diagnostics for failed pipelines', () => {
    const guidance = buildBashFailureGuidance(
      'cat missing.txt | sort',
      1,
      'cat: missing.txt: No such file or directory',
    )

    assert(
      guidance.includes('set -o pipefail'),
      `expected pipefail guidance, got: ${guidance}`,
    )
  })

  test('adds stderr capture hint when repeated redirection is present', () => {
    const guidance = buildBashFailureGuidance(
      'python read_pdf.py 2>&1',
      1,
      'python read_pdf.py 2>&1',
    )

    assert(
      guidance.includes('already captures stderr'),
      `expected stderr capture guidance, got: ${guidance}`,
    )
  })

  test('adds Windows Bash path guidance', () => {
    const guidance = buildBashFailureGuidance(
      'cd "C:\\Projects\\Hadoop"',
      1,
      'bash: cd: C:ProjectsHadoop: No such file or directory',
    )

    assert(
      guidance.includes('prefer C:/path or /c/path'),
      `expected Windows Bash path guidance, got: ${guidance}`,
    )
  })

  test('adds project-root diagnostics for cd plus npm commands', () => {
    const guidance = buildBashFailureGuidance(
      'cd frontend && npm run build',
      1,
      'bash: cd: frontend: No such file or directory',
    )

    assert(
      guidance.includes('verify the active cwd and target'),
      `expected cwd target guidance, got: ${guidance}`,
    )
    assert(
      guidance.includes('find .. -maxdepth 4 -name package.json'),
      `expected project manifest search guidance, got: ${guidance}`,
    )
  })

  test('adds project-root diagnostics even without command output', () => {
    const guidance = buildBashFailureGuidance(
      'cd frontend && npm run build',
      1,
      '',
    )

    assert(
      guidance.includes('Resolve the project root'),
      `expected project-root guidance, got: ${guidance}`,
    )
  })

  test('classifies missing runtime dependencies', () => {
    const guidance = buildBashFailureGuidance(
      'node app.js',
      1,
      "Error: Cannot find module 'express'",
    )

    assert(
      guidance.includes('required module or dependency'),
      `expected dependency guidance, got: ${guidance}`,
    )
  })

  test('classifies interactive terminal failures', () => {
    const guidance = buildBashFailureGuidance(
      'docker exec -it namenode bash',
      1,
      'the input device is not a TTY',
    )

    assert(
      guidance.includes('interactive terminal'),
      `expected TTY guidance, got: ${guidance}`,
    )
  })

  test('appends guidance once', () => {
    const once = appendBashFailureGuidance('false', 1, '')
    const twice = appendBashFailureGuidance('false', 1, once)

    assert(once === twice, 'guidance should not duplicate')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
