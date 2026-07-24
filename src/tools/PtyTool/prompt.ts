export const PTY_TOOL_NAME = 'Pty'

export const DESCRIPTION =
  'Run a command inside a real pseudoterminal (PTY) for TUIs, REPLs, password prompts, and other interactive shells. Captures output until the command exits or timeout fires.'

export const PTY_TOOL_PROMPT = `Run command inside pseudoterminal (PTY). Use when command requires real TTY — full-screen TUIs (top, htop, vim for one-shot ops), REPLs, interactive installers, or programs detecting "is a tty".

When NOT to use:
- Plain non-interactive commands. Use Bash (or PowerShell on Windows) — faster + more featureful.
- Long-running daemons / dev servers. PTY waits for shell exit; daemons never exit. Use BashTool background mode.

Inputs:
- \`command\` (required): command to run. Sent to fresh shell inside PTY, followed by automatic \`exit\` so shell terminates.
- \`cwd\` (optional): working directory. Defaults to current process cwd.
- \`timeoutMs\` (optional): kill PTY after this many ms. Default 30000, max 600000.
- \`cols\` / \`rows\` (optional): terminal size. Defaults 120x30. Affects TUI layout.

Output:
- Captured terminal output (includes ANSI control codes — render visibly in transcript).
- exitCode, durationMs, plus timedOut / truncated flags when relevant.

Notes:
- Output capped at 1 MiB. Beyond that, dropped (marked truncated).
- ANSI escape sequences kept verbatim — informative for interpreting TUI state.
- If node-pty not installed, returns error; install or rebuild with native module.`
