export const SNAPSHOT_TOOL_NAME = 'Snapshot'

export const DESCRIPTION =
  'Save, list, diff, or restore working-tree snapshots stored in a shadow git repo. Independent of the project .git.'

export const SNAPSHOT_TOOL_PROMPT = `Manage working-tree snapshots in a shadow git repo under data directory. Never touches project .git — safe undo layer.

When to use:
- Before risky edit or multi-step refactor, "save" snapshot to revert if wrong.
- If edits broke something, "list", pick last good hash, then "restore".
- Use "diff" to inspect changes before "restore".

Actions:
- "save": Stage every modified/untracked file (>2 MB auto-excluded) and commit. Returns snapshot hash. Optional \`label\` for human-readable note (e.g., "before adding auth"). Always succeeds with hash even if nothing changed.
- "list": Return most recent snapshots with hash, ISO timestamp, label.
- "diff": Return per-file differences between CURRENT working tree and snapshot. Result: {file, status, binary, additions, deletions, patch}. "+" in patch = content in working tree snapshot lacks — restoring removes it. "-" = content snapshot has working tree lacks — restoring brings it back. Preview what "restore" does. Pass \`compareHash\` to diff snapshot \`hash\` (base) against ANOTHER snapshot (target) instead of working tree.
- "restore": Atomically load snapshot tree into working tree (read-tree + checkout-index). Does NOT delete files absent from snapshot — only overwrites files snapshot contains.

Inputs:
- \`action\` (required): "save", "list", "diff", "restore".
- \`hash\` (required for "diff" and "restore"): full or unambiguous prefix.
- \`compareHash\` (optional, "diff" only): second snapshot hash. Diffs \`hash\` (base) → \`compareHash\` (target).
- \`label\` (optional, "save" only): short human-readable description.
- \`limit\` (optional, "list" only): max entries (default 20, max 500).

Notes:
- Restoring overwrites working tree for files in snapshot. Confirm with user before "restore" unless they explicitly asked to revert.
- Snapshots per-project; switching projects gets different shadow repo.
- Old snapshot objects pruned weekly by internal gc loop.
- Shadow repo isolated — project pre-commit hooks never fire.`
