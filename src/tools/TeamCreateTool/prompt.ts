export function getPrompt(): string {
  return `
# TeamCreate

Create new team + task list.

When to use:
- User explicitly requests team/swarm/agents.
- Multi-agent parallel task execution.

Workflow:
1. TeamCreate => creates team config + task list.
2. TaskCreate => populates tasks.
3. Agent tool => spawns teammates (\`team_name\`, \`name\`).
4. TaskUpdate => assigns tasks (\`owner\`).
5. Shutdown => SendMessage \`{type: "shutdown_request"}\`.

Refer to teammates by NAME. Teammates automatically deliver incoming messages.
`.trim()
}
