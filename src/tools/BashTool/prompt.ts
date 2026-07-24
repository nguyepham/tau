import { feature } from 'bun:bundle'
import { prependBullets } from '../../constants/prompts.js'
import { getAttributionTexts } from '../../utils/attribution.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldIncludeGitInstructions } from '../../utils/gitSettings.js'
import { getClaudeTempDir } from '../../utils/permissions/filesystem.js'
import { getPlatform } from '../../utils/platform.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import {
  getUndercoverInstructions,
  isUndercover,
} from '../../utils/undercover.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { TodoWriteTool } from '../TodoWriteTool/TodoWriteTool.js'
import {
  getBashCommandBestPractices,
  getBashPlatformBestPractices,
} from './bashBestPractices.js'
import { BASH_TOOL_NAME } from './toolName.js'

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
  return "Use `run_in_background: true` for long-running commands as tracked background tasks. Required for servers, watchers, port-forwards, SSH tunnels, foreground container runs. Do not put `&`, `nohup`, `disown`, `echo $!`, `docker compose up -d`, or `docker run -d` in command; keep log redirection, remove shell-level detaching, set `run_in_background: true` on tool call. Examples: `uvicorn app:app --host 0.0.0.0 > \"$TMPDIR/app.log\" 2>&1`, `kubectl port-forward svc/api 8080:80`, or `docker compose up`, with `run_in_background: true`. Notified on completion; can stop by task ID."
}

function getCommitAndPRInstructions(): string {
  // Defense-in-depth: undercover instructions must survive even if the user
  // has disabled git instructions entirely. Attribution stripping and model-ID
  // hiding are mechanical and work regardless, but the explicit "don't blow
  // your cover" instructions are the last line of defense against the model
  // volunteering an internal codename in a commit message.
  const undercoverSection =
    process.env.USER_TYPE === 'ant' && isUndercover()
      ? getUndercoverInstructions() + '\n'
      : ''

  if (!shouldIncludeGitInstructions()) return undercoverSection

  // For ant users, use the short version pointing to skills
  if (process.env.USER_TYPE === 'ant') {
    const skillsSection = !isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
      ? `For git commits and pull requests, use the \`/commit\` and \`/commit-push-pr\` skills:
- \`/commit\` - Create a git commit with staged changes
- \`/commit-push-pr\` - Commit, push, and create a pull request

These skills handle git safety protocols, proper commit message formatting, and PR creation.

Before creating a pull request, run \`/simplify\` to review your changes, then test end-to-end (e.g. via \`/tmux\` for interactive features).

`
      : ''
    return `${undercoverSection}# Git operations

${skillsSection}IMPORTANT: NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it.

Use the gh command via the Bash tool for other GitHub-related tasks including working with issues, checks, and releases. If given a Github URL use the gh command to get the information needed.

# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments`
  }

  // For external users, include full inline instructions
  const { commit: commitAttribution, pr: prAttribution } = getAttributionTexts()

  return `# Committing changes with git

Only create commits when requested by the user. If unclear, ask first. When the user asks you to create a new git commit, follow these steps carefully:

You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. The numbered steps below indicate which commands should be batched in parallel.

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive git commands (push --force, reset --hard, checkout ., restore ., clean -f, branch -D) unless the user explicitly requests these actions. Taking unauthorized destructive actions is unhelpful and can result in lost work, so it's best to ONLY run these commands when given direct instructions 
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- CRITICAL: Always create NEW commits rather than amending, unless the user explicitly requests a git amend. When a pre-commit hook fails, the commit did NOT happen — so --amend would modify the PREVIOUS commit, which may result in destroying work or losing previous changes. Instead, after hook failure, fix the issue, re-stage, and create a NEW commit
- When staging files, prefer adding specific files by name rather than using "git add -A" or "git add .", which can accidentally include sensitive files (.env, credentials) or large binaries
- NEVER commit changes unless the user explicitly asks you to. It is VERY IMPORTANT to only commit when explicitly asked, otherwise the user will feel that you are being too proactive

1. Run the following bash commands in parallel, each using the ${BASH_TOOL_NAME} tool:
  - Run a git status command to see all untracked files. IMPORTANT: Never use the -uall flag as it can cause memory issues on large repos.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.
2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:
  - Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
  - Do not commit files that likely contain secrets (.env, credentials.json, etc). Warn the user if they specifically request to commit those files
  - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
  - Ensure it accurately reflects the changes and their purpose
3. Run the following commands in parallel:
   - Add relevant untracked files to the staging area.
   - Create the commit with a message${commitAttribution ? ` ending with:\n   ${commitAttribution}` : '.'}
   - Run git status after the commit completes to verify success.
   Note: git status depends on the commit completing, so run it sequentially after the commit.
4. If the commit fails due to pre-commit hook: fix the issue and create a NEW commit

Important notes:
- NEVER run additional commands to read or explore code, besides git bash commands
- NEVER use the ${TodoWriteTool.name} or ${AGENT_TOOL_NAME} tools
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
- IMPORTANT: Do not use --no-edit with git rebase commands, as the --no-edit flag is not a valid option for git rebase.
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:
<example>
git commit -m "$(cat <<'EOF'
   Commit message here.${commitAttribution ? `\n\n   ${commitAttribution}` : ''}
   EOF
   )"
</example>

# Creating pull requests
Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. Run the following bash commands in parallel using the ${BASH_TOOL_NAME} tool, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files (never use -uall flag)
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and \`git diff [base-branch]...HEAD\` to understand the full commit history for the current branch (from the time it diverged from the base branch)
2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request title and summary:
   - Keep the PR title short (under 70 characters)
   - Use the description/body for details, not the title
3. Run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
<example>
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]${prAttribution ? `\n\n${prAttribution}` : ''}
EOF
)"
</example>

Important:
- DO NOT use the ${TodoWriteTool.name} or ${AGENT_TOOL_NAME} tools
- Return the PR URL when you're done, so the user can see it

# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments`
}

// SandboxManager merges config from multiple sources (settings layers, defaults,
// CLI flags) without deduping, so paths like ~/.cache appear 3× in allowOnly.
// Dedup here before inlining into the prompt — affects only what the model sees,
// not sandbox enforcement. Saves ~150-200 tokens/request when sandbox is enabled.
function dedup<T>(arr: T[] | undefined): T[] | undefined {
  if (!arr || arr.length === 0) return arr
  return [...new Set(arr)]
}

function getSimpleSandboxSection(): string {
  if (!SandboxManager.isSandboxingEnabled()) {
    return ''
  }

  const fsReadConfig = SandboxManager.getFsReadConfig()
  const fsWriteConfig = SandboxManager.getFsWriteConfig()
  const networkRestrictionConfig = SandboxManager.getNetworkRestrictionConfig()
  const allowUnixSockets = SandboxManager.getAllowUnixSockets()
  const ignoreViolations = SandboxManager.getIgnoreViolations()
  const allowUnsandboxedCommands =
    SandboxManager.areUnsandboxedCommandsAllowed()

  // Replace the per-UID temp dir literal (e.g. /private/tmp/claude-1001/) with
  // "$TMPDIR" so the prompt is identical across users — avoids busting the
  // cross-user global prompt cache. The sandbox already sets $TMPDIR at runtime.
  const claudeTempDir = getClaudeTempDir()
  const normalizeAllowOnly = (paths: string[]): string[] =>
    [...new Set(paths)].map(p => (p === claudeTempDir ? '$TMPDIR' : p))

  const filesystemConfig = {
    read: {
      denyOnly: dedup(fsReadConfig.denyOnly),
      ...(fsReadConfig.allowWithinDeny && {
        allowWithinDeny: dedup(fsReadConfig.allowWithinDeny),
      }),
    },
    write: {
      allowOnly: normalizeAllowOnly(fsWriteConfig.allowOnly),
      denyWithinAllow: dedup(fsWriteConfig.denyWithinAllow),
    },
  }

  const networkConfig = {
    ...(networkRestrictionConfig?.allowedHosts && {
      allowedHosts: dedup(networkRestrictionConfig.allowedHosts),
    }),
    ...(networkRestrictionConfig?.deniedHosts && {
      deniedHosts: dedup(networkRestrictionConfig.deniedHosts),
    }),
    ...(allowUnixSockets && { allowUnixSockets: dedup(allowUnixSockets) }),
  }

  const restrictionsLines = []
  if (Object.keys(filesystemConfig).length > 0) {
    restrictionsLines.push(`Filesystem: ${jsonStringify(filesystemConfig)}`)
  }
  if (Object.keys(networkConfig).length > 0) {
    restrictionsLines.push(`Network: ${jsonStringify(networkConfig)}`)
  }
  if (ignoreViolations) {
    restrictionsLines.push(
      `Ignored violations: ${jsonStringify(ignoreViolations)}`,
    )
  }

  const sandboxOverrideItems: Array<string | string[]> =
    allowUnsandboxedCommands
      ? [
          'You should always default to running commands within the sandbox. Do NOT attempt to set `dangerouslyDisableSandbox: true` unless:',
          [
            'The user *explicitly* asks you to bypass sandbox',
            'A specific command just failed and you see evidence of sandbox restrictions causing the failure. Note that commands can fail for many reasons unrelated to the sandbox (missing files, wrong arguments, network issues, etc.).',
          ],
          'Evidence of sandbox-caused failures includes:',
          [
            '"Operation not permitted" errors for file/network operations',
            'Access denied to specific paths outside allowed directories',
            'Network connection failures to non-whitelisted hosts',
            'Unix socket connection errors',
          ],
          'When you see evidence of sandbox-caused failure:',
          [
            "Immediately retry with `dangerouslyDisableSandbox: true` (don't ask, just do it)",
            'Briefly explain what sandbox restriction likely caused the failure. Be sure to mention that the user can use the `/sandbox` command to manage restrictions.',
            'This will prompt the user for permission',
          ],
          'Treat each command you execute with `dangerouslyDisableSandbox: true` individually. Even if you have recently run a command with this setting, you should default to running future commands within the sandbox.',
          'Do not suggest adding sensitive paths like ~/.bashrc, ~/.zshrc, ~/.ssh/*, or credential files to the sandbox allowlist.',
        ]
      : [
          'All commands MUST run in sandbox mode - the `dangerouslyDisableSandbox` parameter is disabled by policy.',
          'Commands cannot run outside the sandbox under any circumstances.',
          'If a command fails due to sandbox restrictions, work with the user to adjust sandbox settings instead.',
        ]

  const items: Array<string | string[]> = [
    ...sandboxOverrideItems,
    'For temporary files, always use the `$TMPDIR` environment variable. TMPDIR is automatically set to the correct sandbox-writable directory in sandbox mode. Do NOT use `/tmp` directly - use `$TMPDIR` instead.',
  ]

  return [
    '',
    '## Command sandbox',
    'By default, your command will be run in a sandbox. This sandbox controls which directories and network hosts commands may access or modify without an explicit override.',
    '',
    'The sandbox has the following restrictions:',
    restrictionsLines.join('\n'),
    '',
    ...prependBullets(items),
  ].join('\n')
}

export function getSimplePrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep in Claude's shell,
  // so we don't steer away from them (and Glob/Grep tools are removed).
  const embedded = hasEmbeddedSearchTools()

  const toolPreferenceItems = [
    ...(embedded
      ? []
      : [
          `File search: ${GLOB_TOOL_NAME} (NOT find or ls)`,
          `Content search: ${GREP_TOOL_NAME} (NOT grep or rg)`,
        ]),
    `Read files: ${FILE_READ_TOOL_NAME} (NOT cat/head/tail)`,
    `Edit files: ${FILE_EDIT_TOOL_NAME} (NOT sed/awk)`,
    `Write files: ${FILE_WRITE_TOOL_NAME} (NOT echo >/cat <<EOF)`,
    'Communication: Output text directly (NOT echo/printf)',
  ]

  const avoidCommands = embedded
    ? '`cat`, `head`, `tail`, `sed`, `awk`, or `echo`'
    : '`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`'

  const multipleCommandsSubitems = [
    `Independent + can run in parallel: multiple ${BASH_TOOL_NAME} calls in single message. E.g., "git status" + "git diff" as two parallel calls.`,
    `Dependent + must run sequentially: single ${BASH_TOOL_NAME} call with '&&' to chain.`,
    "Use ';' only when running sequentially but don't care if earlier fail.",
    'DO NOT use newlines to separate commands (ok in quoted strings).',
  ]

  const gitSubitems = [
    'Prefer new commit over amending existing.',
    'Before destructive ops (git reset --hard, git push --force, git checkout --), consider safer alternative. Only use destructive when truly best approach.',
    'Never skip hooks (--no-verify) or bypass signing (--no-gpg-sign, -c commit.gpgsign=false) unless user explicitly asks. If hook fails, investigate + fix underlying issue.',
  ]

  const sleepSubitems = [
    'Do not sleep between commands that can run immediately — just run them.',
    ...(feature('MONITOR_TOOL')
      ? [
          'Use Monitor tool to stream events from background process (each stdout line = notification). For one-shot "wait until done," use Bash with run_in_background.',
        ]
      : []),
    'Long-running command? Use `run_in_background`. No sleep needed — notified on completion.',
    'Do not retry failing commands in sleep loop — diagnose root cause.',
    'If waiting for background task started with `run_in_background`, notified on completion — do not poll.',
    ...(feature('MONITOR_TOOL')
      ? [
          '`sleep N` as first command with N ≥ 2 blocked. If need delay (rate limiting, pacing), keep under 2 seconds.',
        ]
      : [
          'If must poll external process, use check command (e.g. `gh run view`) rather than sleeping first.',
          'If must sleep, keep short (1-5 seconds) to avoid blocking user.',
        ]),
  ]
  const backgroundNote = getBackgroundUsageNote()
  const platform = getPlatform()
  const platformBestPractices = getBashPlatformBestPractices(platform)
  const commandBestPractices = getBashCommandBestPractices()
  if (platform === 'windows') {
    platformBestPractices.push(
      'Prefer forward slashes in arguments to native Windows binaries. Windows-native CLIs (tasklist, taskkill, reg, netsh, ipconfig, findstr, …) take `/FLAG` arguments that Git Bash may rewrite as paths; Tau auto-doubles recognized flags (`//FLAG`), but prefer PowerShell equivalents when available. Git Bash has no lsof/fuser.',
      'Quote every path containing spaces. In Git Bash on Windows, spell absolute paths directly in command arguments using Git Bash paths for POSIX tools (for example `/c/Path/To/Project`) or drive paths with forward slashes for native Windows tools (for example `C:/Path/To/Project`); this avoids backslash escaping and keeps Linux/macOS absolute paths unchanged.',
    )
  }

  const instructionItems: Array<string | string[]> = [
    'If creating new directories/files, first run `ls` to verify parent directory exists + correct location.',
    'Always quote filepaths with spaces in double quotes (e.g., cd "path with spaces/file.txt")',
    'To target different directory, resolve to absolute path in command. Prefer command\'s own path/directory flag (e.g. `git -C /absolute/path status`, `npm --prefix /absolute/path run build`, `docker compose -f /absolute/path/docker-compose.yml down`) or pass absolute file/directory path as argument. Avoid `cd <dir> && <command>` unless user explicitly asks.',
    'When user names specific directory (e.g. "stop container in C:/proj/TP1", "run build in ./service-b"), MUST target exact directory with absolute path or command\'s path flag. NEVER fall back to current session cwd — cwd may hold DIFFERENT project (another compose file, another package), so bare `docker compose down` / `npm run` / `mvn ...` silently acts on wrong target. If named directory outside current tree, pass absolute path.',
    'Before build/test/package-manager commands for subproject, verify target directory + manifest exist in active cwd. If unsure, run `pwd` + directory listing or manifest search; do not assume folders like `frontend` exist under current session cwd.',
    'CRITICAL: Before commands depending on specific directory (docker compose, npm, python, etc.), ALWAYS verify target exists with Glob or Read. Do NOT guess or hallucinate paths. If target not in current directory, use ABSOLUTE PATHS with command flags (e.g., `docker compose -f /absolute/path/to/compose.yml up -d`) or absolute path arguments instead of relying on current directory.',
    'Run normal Bash directly. Use `plan_only: true` only when user explicitly asks for dry-run plan; not as routine preflight for Python, package-manager, build, test, or cleanup.',
    `Optional timeout in ms (up to ${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} min). Default: ${getDefaultTimeoutMs()}ms (${getDefaultTimeoutMs() / 60000} min).`,
    ...(backgroundNote !== null ? [backgroundNote] : []),
    'Shell correctness rules:',
    commandBestPractices,
    'Platform-specific shell rules:',
    platformBestPractices,
    'Multiple commands:',
    multipleCommandsSubitems,
    'Git commands:',
    gitSubitems,
    'Avoid unnecessary `sleep`:',
    sleepSubitems,
    ...(embedded
      ? [
          "When using `find -regex` with alternation, put longest alternative first. Example: `'.*\\.\\(tsx\\|ts\\)'` not `'.*\\.\\(ts\\|tsx\\)'` — second form silently skips `.tsx` files.",
        ]
      : []),
  ]

  return [
    'Execute bash command, return output.',
    '',
    'Working directory persists between commands; shell state does not. Shell environment initialized from user profile (bash or zsh).',
    '',
    'Directory awareness: when command runs outside session cwd — or cwd drifts from project root — result includes bracketed note stating actual directory. ALWAYS trust these notes over memory of earlier `cd` calls. To target another directory, use absolute path in command or native path flag; do not rely on remembered shell cwd state.',
    '',
    `IMPORTANT: Avoid running ${avoidCommands} commands unless explicitly instructed or after verifying dedicated tool cannot accomplish task. Use dedicated tool instead — better user experience:`,
    '',
    ...prependBullets(toolPreferenceItems),
    `Built-in tools provide better UX + easier review and permission granting than ${BASH_TOOL_NAME}.`,
    '',
    '# Instructions',
    ...prependBullets(instructionItems),
    getSimpleSandboxSection(),
    ...(getCommitAndPRInstructions() ? ['', getCommitAndPRInstructions()] : []),
  ].join('\n')
}
