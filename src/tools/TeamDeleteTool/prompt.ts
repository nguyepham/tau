export function getPrompt(): string {
  return `
# TeamDelete

Remove team + task directories when swarm work complete.

Operation:
- Removes team directory (\`~/.claude/teams/{team-name}/\`)
- Removes task directory (\`~/.claude/tasks/{team-name}/\`)
- Clears team context from current session

**IMPORTANT**: TeamDelete fails if team has active members. Gracefully terminate teammates first, then call TeamDelete after all shut down.

Use when all teammates finished work + want to clean up team resources. Team name auto-determined from current session's team context.
`.trim()
}
