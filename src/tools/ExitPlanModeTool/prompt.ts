// External stub for ExitPlanModeTool prompt - excludes Ant-only allowedPrompts section

// Hardcoded to avoid relative import issues in stub
const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

export const EXIT_PLAN_MODE_V2_TOOL_PROMPT = `Use when in plan mode, plan written to plan file, ready for user approval.

## How This Tool Works
- Plan already written to plan file specified in plan mode system message
- Tool does NOT take plan content as parameter — reads from file
- Signals planning done, ready for review + approval
- User sees plan file contents on review

## When to Use
IMPORTANT: Only use when task requires planning implementation steps of code-writing task. For research tasks — gathering info, searching/reading files, understanding codebase — do NOT use.

## Before Using
Ensure plan complete + unambiguous:
- Unresolved questions about requirements or approach? Use ${ASK_USER_QUESTION_TOOL_NAME} first (in earlier phases)
- Plan finalized? Use THIS tool to request approval

**Important:** Do NOT use ${ASK_USER_QUESTION_TOOL_NAME} to ask "Is this plan okay?" or "Should I proceed?" — that's what THIS tool does. ExitPlanMode inherently requests plan approval.

## Examples

1. "Search for and understand vim mode implementation" — do NOT use exit plan mode (not planning implementation steps)
2. "Help me implement yank mode for vim" — use exit plan mode after planning implementation steps
3. "Add new feature for user authentication" — if unsure about auth method (OAuth, JWT, etc.), use ${ASK_USER_QUESTION_TOOL_NAME} first, then exit plan mode after clarifying approach
`
