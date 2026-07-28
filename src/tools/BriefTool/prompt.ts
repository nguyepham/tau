export const BRIEF_TOOL_NAME = 'SendUserMessage'
export const LEGACY_BRIEF_TOOL_NAME = 'Brief'

export const DESCRIPTION = 'Send a message to the user'

export const BRIEF_TOOL_PROMPT = `Send message to user. Text outside tool visible in detail view only.

\`message\` supports markdown. \`attachments\` takes file paths (images, diffs, logs).

\`status\`: 'normal' for replies, 'proactive' when initiating.`

export const BRIEF_PROACTIVE_SECTION = `## User communication

${BRIEF_TOOL_NAME} delivers user messages. Text outside tool hidden by default.

User prompt => reply through ${BRIEF_TOOL_NAME}.

Delayed answer => single-line ack first ("On it - checking test output"), work, send result.

Long tasks: ack => work => result. Send checkpoint on key decision or surprise. Skip filler text.

Terse messages: decisions, file:line, PR numbers. Use second person ("your config").`
