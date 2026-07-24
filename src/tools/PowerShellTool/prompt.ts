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

  return `Execute PowerShell command with optional timeout. Working directory persists between commands; shell state (variables, functions) does not.

Directory awareness: when command runs outside session cwd — or cwd drifts from project root — result includes bracketed note stating actual directory. ALWAYS trust these notes over memory of earlier directory changes. To target another directory, encode absolute path in command or use native location flag.

IMPORTANT: For terminal operations via PowerShell: git, npm, docker, PS cmdlets. DO NOT use for file operations (reading, writing, editing, searching, finding files) — use specialized tools.

${getEditionSection(edition)}

Before executing:

1. Directory Verification:
   - If creating new directories/files, first use \`Get-ChildItem\` (or \`ls\`) to verify parent directory exists + is correct location
   - Before build/test/package-manager commands for subproject, verify target directory + manifest exist in active cwd. If unsure, run \`Get-Location\` + directory listing or manifest search; do not assume folders like \`frontend\` exist under current session cwd.

2. Command Execution:
   - Always quote file paths with spaces using double quotes
   - Capture command output.

PowerShell Syntax Notes:
   - Variables use $ prefix: $myVar = "value"
   - Escape character is backtick (\`), not backslash
   - Verb-Noun cmdlet naming: Get-ChildItem, Set-Location, New-Item, Remove-Item
   - Common aliases: ls, cd, cat, rm
   - Pipe | passes objects, not text
   - Use Select-Object, Where-Object, ForEach-Object for filtering/transformation
   - String interpolation: "Hello $name" or "Hello $($obj.Property)"
   - Registry: PSDrive prefixes \`HKLM:\\SOFTWARE\\...\`, \`HKCU:\\...\` — NOT raw \`HKEY_LOCAL_MACHINE\\...\`
   - Environment: read with \`$env:NAME\`, set with \`$env:NAME = "value"\` (NOT \`Set-Variable\` or \`export\`)
   - Call native exe with spaces via call operator: \`& "C:\\Program Files\\App\\app.exe" arg1 arg2\`

Interactive/blocking commands (will hang — runs with -NonInteractive):
   - NEVER use \`Read-Host\`, \`Get-Credential\`, \`Out-GridView\`, \`$Host.UI.PromptForChoice\`, \`pause\`
   - Destructive cmdlets (\`Remove-Item\`, \`Stop-Process\`, \`Clear-Content\`, etc.) may prompt. Add \`-Confirm:$false\` when intending action. Use \`-Force\` for read-only/hidden items.
   - Never use \`git rebase -i\`, \`git add -i\`, or other interactive editor commands

Passing multiline strings to native executables:
   - Use single-quoted here-string so PowerShell does not expand \`$\` or backticks. Closing \`'@\` MUST be at column 0 (no leading whitespace) — indenting is parse error:
<example>
git commit -m @'
Commit message here.
Second line with $literal dollar signs.
'@
</example>
   - Use \`@'...'@\` (single-quoted, literal) not \`@"..."@\` (double-quoted, interpolated) unless variable expansion needed
   - For args containing \`-\`, \`@\`, or operator chars, use stop-parsing token: \`git log --% --format=%H\`

Usage notes:
  - Command argument required.
  - Optional timeout in ms (up to ${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} min). Default: ${getDefaultTimeoutMs()}ms (${getDefaultTimeoutMs() / 60000} min).
  - Write clear, concise command description.
  - Output exceeding ${getMaxOutputLength()} chars truncated.
${backgroundNote ? backgroundNote + '\n' : ''}\
  - Avoid PowerShell for commands with dedicated tools unless explicitly instructed:
    - File search: ${GLOB_TOOL_NAME} (NOT Get-ChildItem -Recurse)
    - Content search: ${GREP_TOOL_NAME} (NOT Select-String)
    - Read files: ${FILE_READ_TOOL_NAME} (NOT Get-Content)
    - Edit files: ${FILE_EDIT_TOOL_NAME}
    - Write files: ${FILE_WRITE_TOOL_NAME} (NOT Set-Content/Out-File)
    - Communication: Output text directly (NOT Write-Output/Write-Host)
  - Multiple commands:
    - Independent + parallel: multiple ${POWERSHELL_TOOL_NAME} calls in single message
    - Dependent + sequential: chain in single ${POWERSHELL_TOOL_NAME} call (see edition-specific chaining above)
    - Use \`;\` only when running sequentially but don't care if earlier fail
    - DO NOT use newlines to separate commands (ok in quoted strings + here-strings)
  - Target different directory: put absolute path in command or use native location flag (e.g. \`git -C <absolute-dir>\`, \`npm --prefix <absolute-dir>\`, \`docker compose -f <absolute-compose-file>\`, \`terraform -chdir=<absolute-dir>\`). Do not repeat bare command from wrong directory.
${sleepGuidance ? sleepGuidance + '\n' : ''}\
  - Git commands:
    - Prefer new commit over amending existing.
    - Before destructive operations (git reset --hard, git push --force, git checkout --), consider safer alternative. Only use destructive when truly best approach.
    - Never skip hooks (--no-verify) or bypass signing (--no-gpg-sign, -c commit.gpgsign=false) unless user explicitly asks. If hook fails, investigate + fix underlying issue.`
}
