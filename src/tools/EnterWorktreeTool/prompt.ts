export function getEnterWorktreeToolPrompt(): string {
  return `Use ONLY when user explicitly asks to work in a worktree. Creates isolated git worktree + switches session into it.

## When to Use

- User explicitly says "worktree" (e.g., "start a worktree", "work in a worktree", "create a worktree", "use a worktree")

## When NOT to Use

- User asks to create/switch branch or work on different branch — use git commands
- User asks to fix bug or work on feature — normal git workflow unless they mention worktrees
- Never use unless user explicitly mentions "worktree"

## Requirements

- Must be in git repository, OR have WorktreeCreate/WorktreeRemove hooks in settings.json
- Must not already be in a worktree

## Behavior

- In git repo: creates new git worktree inside \`.claude/worktrees/\` with new branch based on HEAD
- Outside git repo: delegates to WorktreeCreate/WorktreeRemove hooks for VCS-agnostic isolation
- Switches session working directory to new worktree
- Use ExitWorktree to leave mid-session (keep or remove). On session exit, user prompted to keep or remove

## Parameters

- \`name\` (optional): worktree name. Random name generated if not provided.
`
}
