export const DESCRIPTION = 'Update a task in the task list'

export const PROMPT = `Update a task in task list.

## When to Use

**Mark tasks resolved:**
- Completed work described in task
- Task no longer needed or superseded
- IMPORTANT: Always mark assigned tasks resolved when finished
- After resolving, call TaskList for next task

- ONLY mark completed when FULLY accomplished
- Errors, blockers, or cannot finish? Keep as in_progress
- When blocked, create new task describing what needs resolution
- Never mark completed if:
  - Tests failing
  - Implementation partial
  - Unresolved errors
  - Couldn't find necessary files or dependencies

**Delete tasks:**
- Task no longer relevant or created in error
- Set status to \`deleted\` to permanently remove

**Update task details:**
- Requirements change or become clearer
- Establishing dependencies between tasks

## Fields You Can Update

- **status**: Task status (see Status Workflow below)
- **subject**: Change title (imperative form, e.g., "Run tests")
- **description**: Change description
- **activeForm**: Present continuous form shown in spinner when in_progress (e.g., "Running tests")
- **owner**: Change owner (agent name)
- **metadata**: Merge metadata keys (set key to null to delete)
- **addBlocks**: Tasks that cannot start until this one completes
- **addBlockedBy**: Tasks that must complete before this one starts

## Status Workflow

\`pending\` → \`in_progress\` → \`completed\`

Use \`deleted\` to permanently remove.

## Staleness

Read task's latest state with \`TaskGet\` before updating.

## Examples

Mark in progress:
\`\`\`json
{"taskId": "1", "status": "in_progress"}
\`\`\`

Mark completed:
\`\`\`json
{"taskId": "1", "status": "completed"}
\`\`\`

Delete:
\`\`\`json
{"taskId": "1", "status": "deleted"}
\`\`\`

Claim by setting owner:
\`\`\`json
{"taskId": "1", "owner": "my-name"}
\`\`\`

Set dependencies:
\`\`\`json
{"taskId": "2", "addBlockedBy": ["1"]}
\`\`\`
`
