import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

export const GREP_TOOL_NAME = 'Grep'

export function getDescription(): string {
  return `Search tool built on ripgrep

  Usage:
  - ALWAYS use ${GREP_TOOL_NAME} for search. NEVER invoke \`grep\` or \`rg\` via ${BASH_TOOL_NAME}. ${GREP_TOOL_NAME} optimized for correct permissions + access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter with glob (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows file paths (default), "count" shows match counts
  - Use ${AGENT_TOOL_NAME} for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) — literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`
}
