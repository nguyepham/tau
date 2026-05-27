export const SNAPSHOT_TOOL_NAME = 'Snapshot'

export const DESCRIPTION =
  'Save, list, diff, or restore working-tree snapshots stored in a shadow git repo. Independent of the project .git.'

export const SNAPSHOT_TOOL_PROMPT = `Manage working-tree snapshots stored in a shadow git repository under the user's data directory. Snapshots never touch the project's real .git — they are a safe undo layer.

When to use:
- Before a risky edit or multi-step refactor, take a "save" snapshot so you can revert if it goes wrong.
- If edits broke something, call "list", pick the last good hash, then "restore".
- Use "diff" to inspect what would change before calling "restore".

Actions:
- "save": Stage every modified/untracked file (files >2 MB are auto-excluded) and commit. Returns a snapshot hash. Optional \`label\` for a human-readable note (e.g., "before adding auth"). Always succeeds with a hash even if nothing changed.
- "list": Return the most recent snapshots with hash, ISO timestamp, and label.
- "diff": Return per-file differences between the CURRENT working tree and the snapshot. The result is an array of {file, status, binary, additions, deletions, patch}. A "+"-line in the patch is content currently in the working tree that the snapshot does NOT have — restoring would remove it. A "-"-line is content the snapshot has that the working tree lacks — restoring would bring it back. Use this to preview what "restore" would do.
- "restore": Atomically load the snapshot's tree into the working tree (via read-tree + checkout-index). Does NOT delete files that exist now but are absent from the snapshot — only overwrites files the snapshot contains.

Inputs:
- \`action\` (required): one of "save", "list", "diff", "restore".
- \`hash\` (required for "diff" and "restore"): full or unambiguous prefix.
- \`label\` (optional, "save" only): short human-readable description.
- \`limit\` (optional, "list" only): max entries (default 20, max 500).

Notes:
- Restoring overwrites the working tree for files in the snapshot. Confirm with the user before "restore" unless they explicitly asked to revert.
- Snapshots are per-project; switching projects gets a different shadow repo.
- Old snapshot objects are pruned weekly by an internal gc loop.
- The shadow repo is isolated — your project's pre-commit hooks never fire.`
