const MAX_OUTPUT_SAMPLE_CHARS = 1_200

type FailurePattern = {
  pattern: RegExp
  reason: string
  guidance: string
}

const FAILURE_PATTERNS: FailurePattern[] = [
  {
    pattern: /\b(command not found|not recognized as|no such command)\b/i,
    reason: 'The executable or subcommand was not found.',
    guidance:
      'Check the command name, PATH, active shell, container image, and whether the required tool is installed.',
  },
  {
    pattern: /\b(no such file or directory|cannot access|not found)\b/i,
    reason: 'A referenced file, directory, resource, or name was not found.',
    guidance:
      'List the parent location or query the owning system before retrying with a changed path or resource name.',
  },
  {
    pattern: /\b(permission denied|operation not permitted|access is denied)\b/i,
    reason: 'The command reached a permission boundary.',
    guidance:
      'Check ownership, user identity, sandbox/container permissions, and whether the operation needs a privileged context.',
  },
  {
    pattern: /\b(connection refused|could not connect|network is unreachable|temporary failure in name resolution|timeout)\b/i,
    reason: 'The command could not reach a service or network endpoint.',
    guidance:
      'Verify the service is running, the target host/port is correct, and network access is available before retrying.',
  },
  {
    pattern: /\b(usage:|invalid option|unknown option|unrecognized option|requires an argument|missing operand)\b/i,
    reason: 'The command-line interface rejected the arguments.',
    guidance:
      'Inspect the command help for this exact executable/version, then retry with the documented flags and argument order.',
  },
  {
    pattern: /\b(UnicodeEncodeError|codec can't encode character|charmap' codec can't encode|surrogates not allowed)\b/i,
    reason: 'The command failed while encoding text for stdout or stderr.',
    guidance:
      'Force the runtime output encoding to UTF-8 before retrying. For Python, use PYTHONIOENCODING=utf-8 or python -X utf8.',
  },
  {
    pattern: /\b(ModuleNotFoundError|ImportError: No module named|Cannot find module|ERR_MODULE_NOT_FOUND|module not found)\b/i,
    reason: 'The launched runtime could not find a required module or dependency.',
    guidance:
      'Verify the active interpreter/package manager environment, then install the missing dependency or run through the project environment.',
  },
  {
    pattern: /\b(Traceback \(most recent call last\)|SyntaxError|IndentationError|NameError|TypeError|ReferenceError|Exception in thread|NullPointerException)\b/i,
    reason: 'The shell launched the program, but the embedded runtime or script failed.',
    guidance:
      'Debug the reported runtime error directly. Do not keep changing shell quoting unless the traceback points to command-line parsing.',
  },
  {
    pattern: /\b(bad interpreter|env: .*\\r|bash\\r|sh\\r|\r: command not found)\b/i,
    reason: 'The script appears to have an invalid interpreter line or Windows CRLF line endings.',
    guidance:
      'Inspect the shebang and convert the script to LF line endings before retrying.',
  },
  {
    pattern: /\b(is not a tty|input device is not a TTY|inappropriate ioctl|pseudo-terminal|cannot perform an interactive login|interactive prompt)\b/i,
    reason: 'The command expected an interactive terminal or prompt.',
    guidance:
      'Use a non-interactive flag, provide input through stdin, or run the command in a context that allocates a TTY.',
  },
  {
    pattern: /\b(no space left on device|disk quota exceeded)\b/i,
    reason: 'The target filesystem is out of writable space or quota.',
    guidance:
      'Check available space and quotas before retrying the write operation.',
  },
  {
    pattern: /\b(file exists|already exists)\b/i,
    reason: 'The target already exists or the operation is not idempotent as written.',
    guidance:
      'Inspect the existing target and choose an idempotent flag, a different target, or a safe cleanup step.',
  },
]

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ')
}

function commandOnlyOutput(command: string, output: string): boolean {
  const normalizedCommand = normalizeLine(command)
  const significantLines = output
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean)

  return (
    significantLines.length > 0 &&
    significantLines.every(line => line === normalizedCommand)
  )
}

function looksLikePythonCommand(command: string): boolean {
  return /(^|[\s;&|()])(?:python(?:\d+(?:\.\d+)?)?|py)(?:\.exe)?(?=\s|$)/i.test(
    command,
  )
}

function noDiagnosticGuidance(command: string): string {
  if (looksLikePythonCommand(command)) {
    return 'Do not retry near-identical commands. First run a targeted Python diagnostic under the same shell: check sys.executable, sys.stdout.encoding/sys.stderr.encoding, import availability, and a minimal traceback. On Windows, redirected Python output may need PYTHONIOENCODING=utf-8.'
  }
  return 'Do not retry near-identical commands. First run a targeted diagnostic that asks the relevant system for state, existence, permissions, or help output.'
}

function hasPipeline(command: string): boolean {
  return /(^|[^|])\|(?!\|)/.test(command)
}

function unquoteShellToken(token: string): string {
  const trimmed = token.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function shellQuoteForHint(value: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function extractCdTarget(command: string): string | undefined {
  const match = /(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/i.exec(
    command,
  )
  return match?.[1] ? unquoteShellToken(match[1]) : undefined
}

function looksLikeProjectTaskCommand(command: string): boolean {
  return /\b(npm|yarn|pnpm|bun|npx|vite|tsc|eslint|pytest|cargo|mvn|gradle|make)\b|\bpackage\.json\b|\bfrontend\b|\bsrc[\\/]/i.test(
    command,
  )
}

function commandContextGuidance(command: string): string[] {
  const hints: string[] = []

  if (hasPipeline(command) && !/\bpipefail\b/.test(command)) {
    hints.push(
      'For pipelines, test each stage separately or rerun with set -o pipefail to expose the failing stage.',
    )
  }

  if (/\b2>\s*&\s*1\b/.test(command)) {
    hints.push(
      'The Bash tool already captures stderr; adding 2>&1 will not reveal hidden output if the program emitted none.',
    )
  }

  if (/[A-Za-z]:\\/.test(command)) {
    hints.push(
      'In Bash on Windows, prefer C:/path or /c/path over backslash paths unless every backslash is intentionally escaped.',
    )
  }

  const cdTarget = extractCdTarget(command)
  if (cdTarget) {
    const quotedTarget = shellQuoteForHint(cdTarget)
    hints.push(
      `This command depends on changing directories into ${quotedTarget}; before retrying, verify the active cwd and target with pwd && ls -la && test -d ${quotedTarget} && ls -la ${quotedTarget}. If the target is missing, locate the real project directory first.`,
    )
  }

  if (looksLikeProjectTaskCommand(command)) {
    hints.push(
      "Resolve the project root before running build/test/package commands: use pwd && find .. -maxdepth 4 -name package.json -not -path '*/node_modules/*', then run the command from the directory containing the relevant manifest.",
    )
  }

  return hints
}

function appendCommandContextGuidance(guidance: string, command: string): string {
  const hints = commandContextGuidance(command)
  return hints.length > 0 ? `${guidance} ${hints.join(' ')}` : guidance
}

function sampleOutput(output: string): string {
  const trimmed = output.trim()
  if (!trimmed) return ''
  if (trimmed.length <= MAX_OUTPUT_SAMPLE_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_OUTPUT_SAMPLE_CHARS).trimEnd()}\n...`
}

export function buildBashFailureGuidance(
  command: string,
  exitCode: number,
  output: string,
): string {
  const outputSample = sampleOutput(output)
  const effectiveOutput =
    outputSample && !commandOnlyOutput(command, outputSample) ? outputSample : ''
  const matched = effectiveOutput
    ? FAILURE_PATTERNS.find(({ pattern }) => pattern.test(effectiveOutput))
    : undefined

  const reason = matched?.reason ?? (effectiveOutput
    ? 'The command returned a nonzero exit code.'
    : 'The command returned a nonzero exit code without diagnostic output.')

  const baseGuidance =
    matched?.guidance ??
    (effectiveOutput
      ? 'Use the diagnostic output to identify the failing layer before retrying. Avoid repeated near-identical commands unless the next command tests a specific hypothesis.'
      : noDiagnosticGuidance(command))
  const guidance = appendCommandContextGuidance(baseGuidance, command)

  return [
    'Bash failure analysis:',
    `- Exit code: ${exitCode}`,
    `- Reason: ${reason}`,
    `- Next step: ${guidance}`,
  ].join('\n')
}

export function appendBashFailureGuidance(
  command: string,
  exitCode: number,
  output: string,
): string {
  if (output.includes('Bash failure analysis:')) return output
  const guidance = buildBashFailureGuidance(command, exitCode, output)
  return output.trim() ? `${output.trimEnd()}\n\n${guidance}` : guidance
}
