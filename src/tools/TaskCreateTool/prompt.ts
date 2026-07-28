import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = 'Create a new task in the task list'

export function getPrompt(): string {
  const teammateContext = isAgentSwarmsEnabled()
    ? ' and assigned to teammates'
    : ''

  const teammateTips = isAgentSwarmsEnabled()
    ? `- Task description must contain sufficient details for teammate agents.
- New tasks default to status 'pending' without owner. Use TaskUpdate \`owner\` to assign.
`
    : ''

  return `Create structured task list entries for current session.

When to use:
- Multi-step tasks (3+ steps)
- Complex tasks requiring planning/coordination${teammateContext}
- Plan mode tracking
- User explicit task list requests
- User multi-task lists
- Capture new instructions immediately
- Starting task => set status 'in_progress'
- Task completion => set status 'completed'

Omit for:
- Single straightforward tasks (<3 steps)

Task Fields:
- \`subject\`: brief actionable title (imperative form)
- \`description\`: task requirements
- \`activeForm\` (optional): present continuous spinner label

Status defaults to \`pending\`.

Tips:
- Set dependencies via TaskUpdate (\`addBlocks\`, \`addBlockedBy\`).
${teammateTips}- Check TaskList first to avoid duplicates.
`
}
