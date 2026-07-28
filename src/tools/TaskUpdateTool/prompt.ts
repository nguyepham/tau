export const DESCRIPTION = 'Update a task in the task list'

export const PROMPT = `Update task in task list.

When to use:
- Complete task => set \`status: "completed"\` (only when fully accomplished).
- Start task => set \`status: "in_progress"\`.
- Delete task => set \`status: "deleted"\`.
- Update metadata, owner, subject, description, or dependencies (\`addBlocks\`, \`addBlockedBy\`).

Workflow: \`pending\` -> \`in_progress\` -> \`completed\`.

Note: Call TaskGet to verify latest state before updating.`
