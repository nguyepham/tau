export const PTY_TOOL_NAME = 'Pty'

export const DESCRIPTION =
  'Run command in PTY for interactive shells/TUIs. Captures output until exit or timeout.'

export const PTY_TOOL_PROMPT = `Run command in pseudoterminal (PTY). Use for TTY-dependent commands (TUIs, REPLs, interactive prompts).

Omit for:
- Non-interactive commands (use Bash/PowerShell).
- Daemons/servers (use Bash background mode).

Inputs:
- \`command\`: execution string.
- \`cwd\`: working directory.
- \`timeoutMs\`: timeout (default 30000ms, max 600000ms).
- \`cols\` / \`rows\`: terminal dimensions (default 120x30).

Output:
- Terminal output (ANSI codes preserved).
- Metadata (exitCode, durationMs, timedOut, truncated).`
