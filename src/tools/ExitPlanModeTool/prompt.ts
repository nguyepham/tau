// External stub for ExitPlanModeTool prompt - excludes Ant-only allowedPrompts section

// Hardcoded to avoid relative import issues in stub
const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

export const EXIT_PLAN_MODE_V2_TOOL_PROMPT = `Use in plan mode after writing plan to plan file to request user approval.

Rules:
- Plan content read from plan file directly (not tool parameter).
- Implementation coding tasks only. Omit for research/exploration tasks.
- Complete plan before calling tool. Use ${ASK_USER_QUESTION_TOOL_NAME} for unresolved requirements before calling ExitPlanMode.
- ${ASK_USER_QUESTION_TOOL_NAME} forbidden for asking "Is plan okay?" (ExitPlanMode requests approval automatically).
`
