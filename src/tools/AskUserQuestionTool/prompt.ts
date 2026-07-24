import { EXIT_PLAN_MODE_TOOL_NAME } from '../ExitPlanModeTool/constants.js'

export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

export const ASK_USER_QUESTION_TOOL_CHIP_WIDTH = 12

export const DESCRIPTION =
  'Asks the user multiple choice questions to gather info, clarify ambiguity, understand preferences, make decisions, or offer choices.'

export const PREVIEW_FEATURE_PROMPT = {
  markdown: `
Preview feature:
Use the optional \`preview\` field on options when presenting concrete artifacts that users need to visually compare:
- ASCII mockups of UI layouts or components
- Code snippets showing different implementations
- Diagram variations
- Configuration examples

Preview content is rendered as markdown in a monospace box. Multi-line text with newlines is supported. When any option has a preview, the UI switches to a side-by-side layout with a vertical option list on the left and preview on the right. Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).
`,
  html: `
Preview feature:
Use the optional \`preview\` field on options when presenting concrete artifacts that users need to visually compare:
- HTML mockups of UI layouts or components
- Formatted code snippets showing different implementations
- Visual comparisons or diagrams

Preview content must be a self-contained HTML fragment (no <html>/<body> wrapper, no <script> or <style> tags — use inline style attributes instead). Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).
`,
} as const

export const ASK_USER_QUESTION_TOOL_PROMPT = `Use to ask user questions during execution. Allows:
1. Gather preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices
4. Offer choices about direction.

Usage notes:
- Users can always select "Other" for custom text input
- Use multiSelect: true to allow multiple answers
- If recommending specific option, make it first in list + add "(Recommended)" at end of label

Plan mode note: In plan mode, use to clarify requirements or choose approaches BEFORE finalizing plan. Do NOT use to ask "Is my plan ready?" or "Should I proceed?" — use ${EXIT_PLAN_MODE_TOOL_NAME} for plan approval. IMPORTANT: Do not reference "the plan" in questions (e.g., "Do you have feedback about the plan?", "Does the plan look good?") because user cannot see plan in UI until ${EXIT_PLAN_MODE_TOOL_NAME} called. For plan approval, use ${EXIT_PLAN_MODE_TOOL_NAME}.
`
