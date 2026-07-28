export const DESCRIPTION = 'Get task by ID from task list'

export const PROMPT = `Retrieve task by ID from task list.

When to use:
- Fetch full description + context before starting task.
- Inspect task dependencies (\`blocks\`, \`blockedBy\`).

Returns:
- \`subject\`, \`description\`, \`status\` ('pending' | 'in_progress' | 'completed'), \`blocks\`, \`blockedBy\`.

Note: Verify \`blockedBy\` is empty before starting work.`
