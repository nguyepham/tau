export function getExitWorktreeToolPrompt(): string {
  return `Exit EnterWorktree session and return to original working directory.

Scope:
- Operates on EnterWorktree sessions from current session only.
- Outside active worktree session => no-op.

When to use:
- User explicitly asks to exit worktree.

Parameters:
- \`action\`: \`"keep"\` (preserve worktree/branch) or \`"remove"\` (delete worktree/branch).
- \`discard_changes\`: boolean (required true with \`remove\` if uncommitted changes exist).
`
}
