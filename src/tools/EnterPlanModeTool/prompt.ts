import { isPlanModeInterviewPhaseEnabled } from '../../utils/planModeV2.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../AskUserQuestionTool/prompt.js'

const WHAT_HAPPENS_SECTION = `## What Happens in Plan Mode

In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Use ${ASK_USER_QUESTION_TOOL_NAME} if you need to clarify approaches
6. Exit plan mode with ExitPlanMode when ready to implement

`

function getEnterPlanModeToolPromptExternal(): string {
  // When interview phase is enabled, omit the "What Happens" section —
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `Transition to plan mode for non-trivial implementation tasks. Explore codebase + design approach for user approval.

When to use:
- New feature implementation (meaningful functionality)
- Multiple valid approaches (architecture/pattern tradeoffs)
- Code modifications (changing existing behavior)
- Multi-file changes (>2-3 files)
- Unclear requirements / user preference clarification

Omit for:
- Simple single-line/few-line fixes or typos
- Clear specific single-function requests
- Pure research/exploration

${whatHappens}Requires user approval.
`
}

function getEnterPlanModeToolPromptAnt(): string {
  // When interview phase is enabled, omit the "What Happens" section —
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `Transition to plan mode when task has genuine approach ambiguity. Explore codebase + design implementation for user approval.

When to use:
- Significant architectural ambiguity (multiple reasonable approaches)
- Unclear requirements (profiling / target design needed)
- High-impact restructuring (auth redesign, state migration)

Omit when approach clear or request specific. Prefer starting work + AskUserQuestion for specific queries.

${whatHappens}Requires user approval.
`
}

export function getEnterPlanModeToolPrompt(): string {
  return process.env.USER_TYPE === 'ant'
    ? getEnterPlanModeToolPromptAnt()
    : getEnterPlanModeToolPromptExternal()
}
