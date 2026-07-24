export function getExitWorktreeToolPrompt(): string {
  return `Exit a worktree session created by EnterWorktree, return session to original working directory.

## Scope

Only operates on worktrees created by EnterWorktree in this session. Will NOT touch:
- Worktrees created manually with \`git worktree add\`
- Worktrees from previous session (even if created by EnterWorktree)
- Current directory if EnterWorktree was never called

If called outside EnterWorktree session, tool is a **no-op** — reports no active session, filesystem unchanged.

## When to Use

- User explicitly asks to "exit worktree", "leave worktree", "go back", or end worktree session
- Do NOT call proactively — only when user asks

## Parameters

- \`action\` (required): \`"keep"\` or \`"remove"\`
  - \`"keep"\` — leave worktree directory + branch intact on disk. Use if user wants to return later or preserve changes.
  - \`"remove"\` — delete worktree directory + branch. Use for clean exit when done or abandoned.
- \`discard_changes\` (optional, default false): only meaningful with \`action: "remove"\`. If worktree has uncommitted files or commits not on original branch, tool REFUSES to remove unless set to \`true\`. If error lists changes, confirm with user before re-invoking with \`discard_changes: true\`.

## Behavior

- Restores session working directory to pre-EnterWorktree location
- Clears CWD-dependent caches (system prompt sections, memory files, plans directory) so session state reflects original directory
- If tmux session attached to worktree: killed on \`remove\`, left running on \`keep\` (name returned for reattach)
- Once exited, EnterWorktree can be called again for fresh worktree
`
}
