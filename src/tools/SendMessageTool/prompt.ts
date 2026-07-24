import { feature } from 'bun:bundle'

export const DESCRIPTION = 'Send a message to another agent'

export function getPrompt(): string {
  const udsRow = feature('UDS_INBOX')
    ? `\n| \`"uds:/path/to.sock"\` | Local Claude session's socket (same machine; use \`ListPeers\`) |
| \`"bridge:session_..."\` | Remote Control peer session (cross-machine; use \`ListPeers\`) |`
    : ''
  const udsSection = feature('UDS_INBOX')
    ? `\n\n## Cross-session

Use \`ListPeers\` to discover targets:

\`\`\`json
{"to": "uds:/tmp/cc-socks/1234.sock", "message": "check if tests pass over there"}
{"to": "bridge:session_01AbCd...", "message": "what branch are you on?"}
\`\`\`

Peer alive + processes message — no "busy" state; messages enqueue + drain at receiver's next tool round. Message arrives wrapped as \`<cross-session-message from="...">\`. **To reply, copy \`from\` attribute as \`to\`.**`
    : ''
  return `
# SendMessage

Send message to another agent.

\`\`\`json
{"to": "researcher", "summary": "assign task 1", "message": "start on task #1"}
\`\`\`

| \`to\` | |
|---|---|
| \`"researcher"\` | Teammate by name |
| \`"*"\` | Broadcast to all teammates — expensive (linear in team size), use only when everyone needs it |${udsRow}

Plain text output NOT visible to other agents — to communicate, MUST call this tool. Messages from teammates delivered automatically; no inbox check. Refer to teammates by name, never UUID. When relaying, don't quote original — already rendered to user.${udsSection}

## Protocol responses (legacy)

If receiving JSON with \`type: "shutdown_request"\` or \`type: "plan_approval_request"\`, respond with matching \`_response\` type — echo \`request_id\`, set \`approve\` true/false:

\`\`\`json
{"to": "team-lead", "message": {"type": "shutdown_response", "request_id": "...", "approve": true}}
{"to": "researcher", "message": {"type": "plan_approval_response", "request_id": "...", "approve": false, "feedback": "add error handling"}}
\`\`\`

Approving shutdown terminates process. Rejecting plan sends teammate back to revise. Don't originate \`shutdown_request\` unless asked. Don't send structured JSON status messages — use TaskUpdate.
`.trim()
}
