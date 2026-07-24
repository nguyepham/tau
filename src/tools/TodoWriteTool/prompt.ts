import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'

export const PROMPT = `Create + manage structured task list for current coding session. Track progress, organize complex tasks.
Also helps user understand task progress + overall request progress.

## When to Use
Use proactively when:

1. Complex multi-step tasks - 3+ distinct steps or actions
2. Non-trivial tasks - careful planning or multiple operations
3. User explicitly requests todo list
4. User provides multiple tasks (numbered or comma-separated)
5. After new instructions - capture requirements as todos
6. Starting work - mark in_progress BEFORE beginning. Ideally one todo in_progress at a time
7. After completing task - mark completed, add follow-up tasks discovered

## When NOT to Use

Skip when:
1. Single, straightforward task
2. Trivial, no organizational benefit
3. <3 trivial steps
4. Purely conversational or informational

NOTE: don't use for single trivial task. Better to do directly.

## Examples of When to Use

<example>
User: I want to add a dark mode toggle to the application settings. Make sure you run the tests and build when you're done!
Assistant: *Creates todo list:*
1. Creating dark mode toggle component in Settings page
2. Adding dark mode state management (context/store)
3. Implementing CSS-in-JS styles for dark theme
4. Updating existing components to support theme switching
5. Running tests and build process, addressing any failures or errors
*Begins working on first task*
</example>

<example>
User: Help me rename function getCwd to getCurrentWorkingDirectory across project
Assistant: *Searches for all instances of getCwd in codebase*
Found 15 instances across 8 files.
*Creates todo list with specific items for each file*
</example>

<example>
User: I need to implement: user registration, product catalog, shopping cart, and checkout flow.
Assistant: *Creates todo list breaking down each feature*
Let's start with user registration — database models, API endpoints, frontend forms.
</example>

<example>
User: Can you help optimize my React application? It's rendering slowly.
Assistant: *Reviews component structure, render patterns, state management, data fetching*
Identified several performance issues.
*Creates todo list: 1) Memoization for ProductList, 2) Virtualization for Dashboard, 3) Image optimization in Gallery, 4) Fix state update loops in ShoppingCart, 5) Bundle size review + code splitting*
</example>

## Examples of When NOT to Use

<example>
User: How do I print 'Hello World' in Python?
Assistant: print("Hello World")
</example>

<example>
User: What does git status do?
Assistant: Shows current state of working directory and staging area.
</example>

<example>
User: Can you add a comment to calculateTotal function?
Assistant: *Uses ${FILE_EDIT_TOOL_NAME} to add comment*
</example>

<example>
User: Run npm install for me.
Assistant: *Executes npm install*
</example>

## Task States and Management

1. **Task States**:
   - pending: Not yet started
   - in_progress: Currently working (limit to ONE at a time)
   - completed: Finished successfully

   **IMPORTANT**: Tasks must have two forms:
   - content: Imperative form (e.g., "Run tests")
   - activeForm: Present continuous shown during execution (e.g., "Running tests")

2. **Task Management**:
   - Update status in real-time
   - Mark complete IMMEDIATELY after finishing (don't batch)
   - Exactly ONE task in_progress at any time
   - Complete current before starting new
   - Remove irrelevant tasks entirely

3. **Completion Requirements**:
   - ONLY mark completed when FULLY accomplished
   - Errors, blockers, or cannot finish? Keep as in_progress
   - When blocked, create new task describing what needs resolution
   - Never mark completed if: tests failing, implementation partial, unresolved errors, couldn't find necessary files/dependencies

4. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller steps
   - Use clear, descriptive names
   - Always provide both forms:
     - content: "Fix authentication bug"
     - activeForm: "Fixing authentication bug"

When in doubt, use this tool. Proactive task management demonstrates attentiveness + ensures all requirements completed.
`

export const DESCRIPTION =
  'Update the todo list for the current session. Use proactively to track progress + pending tasks. Keep at least one task in_progress. Always provide both content (imperative) and activeForm (present continuous) for each task.'
