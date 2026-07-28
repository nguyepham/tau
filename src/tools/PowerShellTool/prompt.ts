import { isEnvTruthy } from '../../utils/envUtils.js'
import { getMaxOutputLength } from '../../utils/shell/outputLimits.js'
import {
  getPowerShellEdition,
  type PowerShellEdition,
} from '../../utils/shell/powershellDetection.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { POWERSHELL_TOOL_NAME } from './toolName.js'

export function getDefaultTimeoutMs(): number {
  return getDefaultBashTimeoutMs()
}

export function getMaxTimeoutMs(): number {
  return getMaxBashTimeoutMs()
}

function getBackgroundUsageNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return `  - Use the \`run_in_background\` parameter for long-running servers, watchers, port-forwards, tunnels, and foreground container runs. Do not detach them with \`Start-Process\`, \`Start-Job\`, or Docker \`-d\`; keep the command foreground and let Tau track/stop it. You do not need to check the output right away - you'll be notified when it finishes.`
}

function getSleepGuidance(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return `  - Avoid unnecessary \`Start-Sleep\` commands:
    - Do not sleep between commands that can run immediately — just run them.
    - If your command is long running and you would like to be notified when it finishes — simply run your command using \`run_in_background\`. There is no need to sleep in this case.
    - Do not retry failing commands in a sleep loop — diagnose the root cause or consider an alternative approach.
    - If waiting for a background task you started with \`run_in_background\`, you will be notified when it completes — do not poll.
    - If you must poll an external process, use a check command rather than sleeping first.
    - If you must sleep, keep the duration short (1-5 seconds) to avoid blocking the user.`
}

/**
 * Version-specific syntax guidance. The model's training data covers both
 * editions but it can't tell which one it's targeting, so it either emits
 * pwsh-7 syntax on 5.1 (parser error → exit 1) or needlessly avoids && on 7.
 */
function getEditionSection(edition: PowerShellEdition | null): string {
  if (edition === 'desktop') {
    return `PowerShell edition: Windows PowerShell 5.1 (powershell.exe)
   - Pipeline chain operators \`&&\` and \`||\` are NOT available — they cause a parser error. To run B only if A succeeds: \`A; if ($?) { B }\`. To chain unconditionally: \`A; B\`.
   - Ternary (\`?:\`), null-coalescing (\`??\`), and null-conditional (\`?.\`) operators are NOT available. Use \`if/else\` and explicit \`$null -eq\` checks instead.
   - Avoid \`2>&1\` on native executables. In 5.1, redirecting a native command's stderr inside PowerShell wraps each line in an ErrorRecord (NativeCommandError) and sets \`$?\` to \`$false\` even when the exe returned exit code 0. stderr is already captured for you — don't redirect it.
   - Default file encoding is UTF-16 LE (with BOM). When writing files other tools will read, pass \`-Encoding utf8\` to \`Out-File\`/\`Set-Content\`.
   - \`ConvertFrom-Json\` returns a PSCustomObject, not a hashtable. \`-AsHashtable\` is not available.`
  }
  if (edition === 'core') {
    return `PowerShell edition: PowerShell 7+ (pwsh)
   - Pipeline chain operators \`&&\` and \`||\` ARE available and work like bash. Prefer \`cmd1 && cmd2\` over \`cmd1; cmd2\` when cmd2 should only run if cmd1 succeeds.
   - Ternary (\`$cond ? $a : $b\`), null-coalescing (\`??\`), and null-conditional (\`?.\`) operators are available.
   - Default file encoding is UTF-8 without BOM.`
  }
  // Detection not yet resolved (first prompt build before any tool call) or
  // PS not installed. Give the conservative 5.1-safe guidance.
  return `PowerShell edition: unknown — assume Windows PowerShell 5.1 for compatibility
   - Do NOT use \`&&\`, \`||\`, ternary \`?:\`, null-coalescing \`??\`, or null-conditional \`?.\`. These are PowerShell 7+ only and parser-error on 5.1.
   - To chain commands conditionally: \`A; if ($?) { B }\`. Unconditionally: \`A; B\`.`
}

export async function getPrompt(): Promise<string> {
  const backgroundNote = getBackgroundUsageNote()
  const sleepGuidance = getSleepGuidance()
  const edition = await getPowerShellEdition()

  return `Executes PowerShell command. Working directory persists; shell state does not.

Directory awareness: trust bracketed directory note in tool outputs over remembered state. Target other directories via absolute path or command location flags.

Avoid using PowerShell for file operations (read, write, edit, search) - use dedicated tools.

${getEditionSection(edition)}

Usage:
- Verify parent directory exists before creating files/directories.
- Quote paths with spaces.
- Non-interactive mode only: avoid Read-Host, Get-Credential, interactive editors.
- Use \`-Confirm:$false\` for destructive cmdlets.
- Herestring for multiline: @'...'@ with closing '@ at column 0.
- Optional timeout: up to ${getMaxTimeoutMs()}ms (default ${getDefaultTimeoutMs()}ms).
${backgroundNote ? backgroundNote + '\n' : ''}\
- Dedicated tools:
  - File search: ${GLOB_TOOL_NAME}
  - Content search: ${GREP_TOOL_NAME}
  - Read files: ${FILE_READ_TOOL_NAME}
  - Edit files: ${FILE_EDIT_TOOL_NAME}
  - Write files: ${FILE_WRITE_TOOL_NAME}
${sleepGuidance ? sleepGuidance + '\n' : ''}\
- Git: create NEW commits instead of amending. Confirm before destructive git ops. Never skip hooks.`
}
