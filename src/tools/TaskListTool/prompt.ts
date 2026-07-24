import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = 'List all tasks in the task list'

export function getPrompt(): string {
  const teammateUseCase = isAgentSwarmsEnabled()
    ? `- Before assigning tasks to teammates, to see what's available
`
    : ''

  const idDescription = isAgentSwarmsEnabled()
    ? '- **id**: Task identifier (use with TaskGet, TaskUpdate)'
    : '- **id**: Task identifier (use with TaskGet, TaskUpdate)'

  const teammateWorkflow = isAgentSwarmsEnabled()
    ? `
## Teammate Workflow

When working as a teammate:
1. After completing your current task, call TaskList to find available work
2. Look for tasks with status 'pending', no owner, and empty blockedBy
3. **Prefer tasks in ID order** (lowest ID first) when multiple tasks are available, as earlier tasks often set up context for later ones
4. Claim an available task using TaskUpdate (set \`owner\` to your name), or wait for leader assignment
5. If blocked, focus on unblocking tasks or notify the team lead
`
    : ''

  return `List all tasks in task list.

## When to Use

- See available tasks (status: 'pending', no owner, not blocked)
- Check overall project progress
- Find blocked tasks needing dependency resolution
${teammateUseCase}- After completing task, check for newly unblocked work or claim next available task
- **Prefer tasks in ID order** (lowest ID first) when multiple available — earlier tasks often set up context for later ones

## Output

Summary of each task:
${idDescription}
- **subject**: Brief description
- **status**: 'pending', 'in_progress', or 'completed'
- **owner**: Agent ID if assigned, empty if available
- **blockedBy**: Open task IDs that must resolve first (tasks with blockedBy cannot be claimed until dependencies resolve)

Use TaskGet with specific task ID for full details including description + comments.
${teammateWorkflow}`
}
