import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

export const GREP_TOOL_NAME = 'Grep'

export function getDescription(): string {
  return `Search tool built on ripgrep.

  Usage:
  - ALWAYS use ${GREP_TOOL_NAME} for content search tasks. Bash \`grep\` or \`rg\` forbidden.
  - Supports regex syntax ("log.*Error", "function\\s+\\w+").
  - Filter with glob ("*.js", "**/*.tsx") or type ("js", "py", "rust").
  - Output modes: "content", "files_with_matches" (default), "count".
  - Open-ended multi-round search => use ${AGENT_TOOL_NAME}.
  - Ripgrep syntax: escape literal braces (\`interface\\{\\}\`).
  - Cross-line pattern => set \`multiline: true\`.
`
}
