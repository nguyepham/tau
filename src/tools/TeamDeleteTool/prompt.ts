export function getPrompt(): string {
  return `
# TeamDelete

Remove team (\`~/.claude/teams/{team-name}/\`) and task directories (\`~/.claude/tasks/{team-name}/\`).

Prerequisite: Terminate active teammates first (TeamDelete fails if members remain active).
`.trim()
}
