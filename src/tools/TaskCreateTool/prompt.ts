import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = 'Create a new task in the task list'

export function getPrompt(): string {
  const teammateContext = isAgentSwarmsEnabled()
    ? ' and potentially assigned to teammates'
    : ''

  const teammateTips = isAgentSwarmsEnabled()
    ? `- Include enough detail in the description for another agent to understand and complete the task
- New tasks are created with status 'pending' and no owner - use TaskUpdate with the \`owner\` parameter to assign them
`
    : ''

  return `Create structured task list for current coding session. Track progress, organize complex tasks.

## When to Use

Use proactively when:

- Complex multi-step tasks - 3+ distinct steps or actions
- Non-trivial tasks - careful planning or multiple operations${teammateContext}
- Plan mode - create task list to track work
- User explicitly requests todo list
- User provides multiple tasks (numbered or comma-separated)
- After new instructions - capture requirements as tasks
- Starting work on task - mark in_progress BEFORE beginning
- After completing task - mark completed, add follow-up tasks

## When NOT to Use

Skip when:
- Single, straightforward task
- Trivial, no organizational benefit
- <3 trivial steps
- Purely conversational or informational

NOTE: don't use for single trivial task. Better to do it directly.

## Task Fields

- **subject**: Brief actionable title in imperative form (e.g., "Fix authentication bug in login flow")
- **description**: What needs to be done
- **activeForm** (optional): Present continuous form shown in spinner when in_progress (e.g., "Fixing authentication bug"). If omitted, spinner shows subject.

All tasks created with status \`pending\`.

## Tips

- Create tasks with clear, specific subjects describing outcome
- After creating, use TaskUpdate to set up dependencies (blocks/blockedBy) if needed
${teammateTips}- Check TaskList first to avoid duplicates
`
}
