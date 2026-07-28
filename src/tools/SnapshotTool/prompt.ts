export const SNAPSHOT_TOOL_NAME = 'Snapshot'

export const DESCRIPTION =
  'Save, list, diff, or restore working-tree snapshots in shadow git repo. Independent of project .git.'

export const SNAPSHOT_TOOL_PROMPT = `Manage working-tree snapshots in shadow git repo. Undo layer independent of project .git.

When to use:
- Save snapshot before risky edit or multi-step refactor.
- Restore from list hash if edits break build.
- Diff before restore.

Actions:
- \`save\`: stage files + commit. Optional \`label\`.
- \`list\`: return recent snapshots (hash, ISO timestamp, label).
- \`diff\`: per-file differences between working tree and snapshot (or base vs target hash).
- \`restore\`: load snapshot tree into working tree.

Parameters:
- \`action\`: "save" | "list" | "diff" | "restore".
- \`hash\`: required for diff/restore.
- \`compareHash\`: optional second snapshot hash for diff.
- \`label\`: optional description for save.
- \`limit\`: max entries for list.
`
