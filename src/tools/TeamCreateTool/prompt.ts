export function getPrompt(): string {
  return `
# TeamCreate

## When to Use

Use proactively when:
- User explicitly asks to use team, swarm, or group of agents
- User mentions agents working together, coordinating, or collaborating
- Task complex enough for parallel work by multiple agents (full-stack feature with frontend + backend, refactoring while keeping tests passing, multi-step project with research + planning + coding)

When in doubt, prefer spawning a team.

## Choosing Agent Types for Teammates

Choose \`subagent_type\` based on tools agent needs. Each type has different available tools:

- **Read-only agents** (Explore, Plan) cannot edit/write files. Assign only research, search, or planning. Never implementation.
- **Full-capability agents** (general-purpose) have all tools including file editing, writing, bash. Use for tasks requiring changes.
- **Custom agents** in \`.claude/agents/\` may have tool restrictions. Check descriptions.

Review agent type descriptions + available tools in Agent tool prompt before selecting \`subagent_type\`.

Create team to coordinate multiple agents. Teams have 1:1 correspondence with task lists (Team = TaskList).

\`\`\`
{
  "team_name": "my-project",
  "description": "Working on feature X"
}
\`\`\`

Creates:
- Team file at \`~/.claude/teams/{team-name}/config.json\`
- Task list directory at \`~/.claude/tasks/{team-name}/\`

## Team Workflow

1. **Create team** with TeamCreate — creates team + task list
2. **Create tasks** with Task tools (TaskCreate, TaskList, etc.) — auto-use team's task list
3. **Spawn teammates** with Agent tool using \`team_name\` + \`name\` params
4. **Assign tasks** with TaskUpdate using \`owner\` to give tasks to idle teammates
5. **Teammates work on assigned tasks**, mark completed via TaskUpdate
6. **Teammates go idle between turns** — auto-idle + send notification. IMPORTANT: Be patient! Don't comment on idleness until it impacts work.
7. **Shutdown team** — when done, gracefully shut down teammates via SendMessage with \`message: {type: "shutdown_request"}\`.

## Task Ownership

Tasks assigned via TaskUpdate with \`owner\` param. Any agent can set/change ownership.

## Automatic Message Delivery

**IMPORTANT**: Messages from teammates auto-delivered. No need to check inbox.

When spawning teammates:
- They send messages on task completion or when needing help
- Messages appear as new conversation turns (like user messages)
- If busy (mid-turn), messages queued + delivered when turn ends
- UI shows brief notification with sender name when messages waiting

Messages delivered automatically.

When reporting on teammate messages, no need to quote original — already rendered to user.

## Teammate Idle State

Teammates go idle after every turn — normal + expected. Idle after sending message does NOT mean done or unavailable. Idle = waiting for input.

- **Idle teammates can receive messages.** Sending message wakes them, they process normally.
- **Idle notifications automatic.** System sends when teammate's turn ends. No need to react unless assigning new work or sending follow-up.
- **Do not treat idle as error.** Message then idle = normal flow — sent message, waiting for response.
- **Peer DM visibility.** When teammate DMs another, brief summary in idle notification. Gives visibility into peer collaboration. No need to respond — informational.

## Discovering Team Members

Teammates can read team config to discover others:
- **Config location**: \`~/.claude/teams/{team-name}/config.json\`

Config contains \`members\` array with:
- \`name\`: Human-readable name (**always use this** for messaging + task assignment)
- \`agentId\`: Unique identifier (reference only — do not use for communication)
- \`agentType\`: Role/type

**IMPORTANT**: Always refer to teammates by NAME (e.g., "team-lead", "researcher", "tester"). Names used for:
- \`to\` when sending messages
- Identifying task owners

Example:
\`\`\`
Use Read tool to read ~/.claude/teams/{team-name}/config.json
\`\`\`

## Task List Coordination

Teams share task list at \`~/.claude/tasks/{team-name}/\`.

Teammates should:
1. Check TaskList periodically, **especially after completing each task**, to find available or newly unblocked work
2. Claim unassigned, unblocked tasks with TaskUpdate (set \`owner\` to name). **Prefer tasks in ID order** (lowest first) when multiple available — earlier tasks often set up context for later ones
3. Create new tasks with \`TaskCreate\` when identifying additional work
4. Mark completed with \`TaskUpdate\`, then check TaskList for next work
5. Coordinate with teammates by reading task list status
6. If all available tasks blocked, notify team lead or help resolve blocking tasks

**IMPORTANT communication notes**:
- Do not use terminal tools to view team activity; always send message to teammates (refer by name).
- Team cannot hear you without SendMessage. Always send message when responding.
- Do NOT send structured JSON status messages like \`{"type":"idle",...}\` or \`{"type":"task_completed",...}\`. Communicate in plain text.
- Use TaskUpdate to mark tasks completed.
- If agent in team, system auto-sends idle notifications to team lead on stop.

`.trim()
}
