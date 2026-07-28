import { feature } from 'bun:bundle'

export const DESCRIPTION = 'Send a message to another agent'

export function getPrompt(): string {
  const udsRow = feature('UDS_INBOX')
    ? `\n| \`"uds:/path/to.sock"\` | Local session socket |
| \`"bridge:session_..."\` | Peer session |`
    : ''
  const udsSection = feature('UDS_INBOX')
    ? `\n\n## Cross-session
Use \`ListPeers\` => discover targets.
\`to\`: socket path or bridge session ID.
Receiver processes enqueued messages at next tool round.`
    : ''
  return `
# SendMessage

Send message to another agent.

\`\`\`json
{"to": "researcher", "summary": "assign task 1", "message": "start on task #1"}
\`\`\`

| \`to\` | Target |
|---|---|
| \`"researcher"\` | Teammate by name |
| \`"*"\` | Broadcast to all teammates |${udsRow}

Plain text output hidden from other agents. Call tool to communicate. Refer to teammates by name. Do not quote original text.${udsSection}
`.trim()
}
