export function getEnterWorktreeToolPrompt(): string {
  return `Use ONLY when user explicitly asks for worktree. Creates isolated git worktree + switches session cwd into it.

When to use:
- User explicitly says "worktree".

Omit when:
- Creating/switching branches (use git commands).
- Fixing bugs or implementing features without explicit worktree request.

Requirements:
- Git repo OR WorktreeCreate/WorktreeRemove hooks configured.
- Not already in worktree.

Behavior:
- Git repo => create git worktree in \`.claude/worktrees/\` on new branch.
- Outside git repo => delegate to WorktreeCreate hook.
- Switch cwd to worktree.
- Exit via ExitWorktree tool.

Parameters:
- \`name\` (optional): worktree name.
`
}
