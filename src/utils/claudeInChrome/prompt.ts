export const BASE_CHROME_PROMPT = `# Claude in Chrome browser automation

Use \`mcp__claude-in-chrome__*\` tools for Chrome browser automation.

GIFs: Use \`mcp__claude-in-chrome__gif_creator\` for multi-step flows. Capture extra padding frames.

Console logs: Filter via \`pattern\` parameter in \`read_console_messages\`.

Dialogs: Do not trigger JS alerts/modals. Use \`console.log\` + \`read_console_messages\`. Use \`javascript_tool\` to dismiss existing dialogs.

Loops: Stop and ask user after 2-3 failed attempts or un-responsive pages.

Tabs: Call \`tabs_context_mcp\` at start of session for tab context. Create new tab unless user asks to reuse.`

/**
 * Additional instructions for chrome tools when tool search is enabled.
 * These instruct the model to load chrome tools via ToolSearch before using them.
 * Only injected when tool search is actually enabled (not just optimistically possible).
 */
export const CHROME_TOOL_SEARCH_INSTRUCTIONS = `**IMPORTANT: Before using any chrome browser tools, you MUST first load them using ToolSearch.**

Chrome browser tools are MCP tools that require loading before use. Before calling any mcp__claude-in-chrome__* tool:
1. Use ToolSearch with \`select:mcp__claude-in-chrome__<tool_name>\` to load the specific tool
2. Then call the tool

For example, to get tab context:
1. First: ToolSearch with query "select:mcp__claude-in-chrome__tabs_context_mcp"
2. Then: Call mcp__claude-in-chrome__tabs_context_mcp`

/**
 * Get the base chrome system prompt (without tool search instructions).
 * Tool search instructions are injected separately at request time in claude.ts
 * based on the actual tool search enabled state.
 */
export function getChromeSystemPrompt(): string {
  return BASE_CHROME_PROMPT
}

/**
 * Minimal hint about Claude in Chrome skill availability. This is injected at startup when the extension is installed
 * to guide the model to invoke the skill before using the MCP tools.
 */
export const CLAUDE_IN_CHROME_SKILL_HINT = `**Browser Automation**: Chrome browser tools are available via the "claude-in-chrome" skill. CRITICAL: Before using any mcp__claude-in-chrome__* tools, invoke the skill by calling the Skill tool with skill: "claude-in-chrome". The skill provides browser automation instructions and enables the tools.`

/**
 * Variant when the built-in WebBrowser tool is also available — steer
 * dev-loop tasks to WebBrowser and reserve the extension for the user's
 * authenticated Chrome (logged-in sites, OAuth, computer-use).
 */
export const CLAUDE_IN_CHROME_SKILL_HINT_WITH_WEBBROWSER = `**Browser Automation**: Use WebBrowser for development (dev servers, JS eval, console, screenshots). Use claude-in-chrome for the user's real Chrome when you need logged-in sessions, OAuth, or computer-use — invoke Skill(skill: "claude-in-chrome") before any mcp__claude-in-chrome__* tool.`
