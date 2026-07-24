import { isPlanModeInterviewPhaseEnabled } from '../../utils/planModeV2.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../AskUserQuestionTool/prompt.js'

const WHAT_HAPPENS_SECTION = `## What Happens in Plan Mode

1. Explore codebase with Glob, Grep, Read
2. Understand patterns + architecture
3. Design implementation approach
4. Present plan for approval
5. Use ${ASK_USER_QUESTION_TOOL_NAME} to clarify approaches
6. Exit with ExitPlanMode when ready

`

function getEnterPlanModeToolPromptExternal(): string {
  // When interview phase is enabled, omit the "What Happens" section —
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `Use this tool before non-trivial implementation tasks. Getting sign-off on approach before coding prevents wasted effort. Transitions to plan mode for codebase exploration + design.

## When to Use

**Prefer EnterPlanMode** for implementation tasks unless simple. Use when ANY apply:

1. **New Feature**: Adding meaningful functionality
   - "Add a logout button" - where? what on click?
   - "Add form validation" - what rules? what errors?

2. **Multiple Approaches**: Several valid solutions exist
   - "Add caching to API" - Redis vs in-memory vs file-based
   - "Improve performance" - many optimization strategies

3. **Code Modifications**: Changes affecting existing behavior or structure
   - "Update login flow" - what changes?
   - "Refactor component" - target architecture?

4. **Architectural Decisions**: Choice between patterns or technologies
   - "Add real-time updates" - WebSockets vs SSE vs polling
   - "Implement state management" - Redux vs Context vs custom

5. **Multi-File Changes**: Touches >2-3 files
   - "Refactor authentication system"
   - "Add new API endpoint with tests"

6. **Unclear Requirements**: Need exploration before full scope understood
   - "Make app faster" - profile + identify bottlenecks
   - "Fix checkout bug" - investigate root cause

7. **Preferences Matter**: Multiple reasonable implementations
   - If using ${ASK_USER_QUESTION_TOOL_NAME} to clarify approach, use EnterPlanMode instead
   - Plan mode: explore first, present options with context

## When NOT to Use

Skip for simple tasks:
- Single-line or few-line fixes (typos, obvious bugs, small tweaks)
- Single function with clear requirements
- Very specific, detailed user instructions
- Pure research/exploration (use Agent tool with explore agent)

${whatHappens}## Examples

### GOOD - Use EnterPlanMode:
"Add user authentication" - session vs JWT, token storage, middleware structure
"Optimize database queries" - multiple approaches, profile first, significant impact
"Implement dark mode" - theme system architecture, affects many components
"Add delete button to user profile" - placement, confirmation, API call, error handling, state
"Update error handling in API" - affects multiple files, needs approval

### BAD - Don't use EnterPlanMode:
"Fix typo in README" - straightforward, no planning
"Add console.log to debug" - simple, obvious
"What files handle routing?" - research, not implementation

## Important Notes

- REQUIRES user consent to enter plan mode
- When unsure, err toward planning - alignment upfront > redo work
- Users appreciate consultation before significant changes
`
}

function getEnterPlanModeToolPromptAnt(): string {
  // When interview phase is enabled, omit the "What Happens" section —
  // detailed workflow instructions arrive via the plan_mode attachment (messages.ts).
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `Use this tool when approach is genuinely ambiguous and user input prevents significant rework. Transitions to plan mode for codebase exploration + design.

## When to Use

Plan mode valuable when approach is unclear. Use when:

1. **Significant Architectural Ambiguity**: Multiple reasonable approaches, choice affects codebase
   - "Add caching to API" - Redis vs in-memory vs file-based
   - "Add real-time updates" - WebSockets vs SSE vs polling

2. **Unclear Requirements**: Need exploration + clarification before progress
   - "Make app faster" - profile + identify bottlenecks
   - "Refactor module" - understand target architecture

3. **High-Impact Restructuring**: Significantly restructures existing code, buy-in reduces risk
   - "Redesign authentication system"
   - "Migrate state management approach"

## When NOT to Use

Skip plan mode when approach is inferable:
- Straightforward task even if multi-file
- Specific enough request, clear implementation path
- Feature with obvious pattern (button, endpoint following conventions)
- Bug fix where fix is clear once bug understood
- Research/exploration (use Agent tool)
- User says "can we work on X" or "let's do X" — start working

When in doubt, start work + use ${ASK_USER_QUESTION_TOOL_NAME} for specific questions.

${whatHappens}## Examples

### GOOD - Use EnterPlanMode:
"Add user authentication" - genuinely ambiguous: session vs JWT, token storage, middleware
"Redesign data pipeline" - major restructuring, wrong approach wastes effort

### BAD - Don't use EnterPlanMode:
"Add delete button to user profile" - clear path, just do it
"Can we work on search feature?" - user wants to start, not plan
"Update error handling in API" - start working, ask specific questions
"Fix typo in README" - straightforward, no planning

## Important Notes

- REQUIRES user consent to enter plan mode
`
}

export function getEnterPlanModeToolPrompt(): string {
  return process.env.USER_TYPE === 'ant'
    ? getEnterPlanModeToolPromptAnt()
    : getEnterPlanModeToolPromptExternal()
}
