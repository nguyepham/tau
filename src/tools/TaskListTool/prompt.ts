import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = 'List all tasks in the task list'

export function getPrompt(): string {
  const teammateUseCase = isAgentSwarmsEnabled()
    ? `- Check available tasks before teammate assignment
`
    : ''

  const idDescription = '- **id**: Task identifier'

  const teammateWorkflow = isAgentSwarmsEnabled()
    ? `\nTeammate Workflow:
1. Complete current task => call TaskList for next task.
2. Target: status 'pending', no owner, empty \`blockedBy\`.
3. Prefer tasks in ID order (lowest ID first).
4. Claim via TaskUpdate (\`owner: <name>\`).`
    : ''

  return `List all tasks in task list.

When to use:
- Check available tasks ('pending', no owner, unblocked).
- Track project progress.
- Find blocked tasks.
${teammateUseCase}- Prefer tasks in ID order (lowest ID first).

Returns array of task summaries:
${idDescription}
- \`subject\`: brief title
- \`status\`: 'pending' | 'in_progress' | 'completed'
- \`owner\`: agent ID or empty
- \`blockedBy\`: blocking task IDs
${teammateWorkflow}`
}
