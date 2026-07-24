export const DESCRIPTION = 'Get a task by ID from the task list'

export const PROMPT = `Retrieve a task by ID from task list.

## When to Use

- Need full description + context before starting work
- Understand task dependencies (what it blocks, what blocks it)
- After task assignment, get complete requirements

## Output

Full task details:
- **subject**: Task title
- **description**: Detailed requirements + context
- **status**: 'pending', 'in_progress', or 'completed'
- **blocks**: Tasks waiting on this one
- **blockedBy**: Tasks that must complete before this one starts

## Tips

- After fetching, verify blockedBy list empty before beginning work.
- Use TaskList for summary view.
`
