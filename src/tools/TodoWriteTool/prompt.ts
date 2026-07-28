import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'

export const PROMPT = `Creates and manages structured task list for session. Tracks progress on multi-step work.

Usage:
- Proactive use for multi-step tasks (≥3 steps), complex refactors, user task lists, new instructions.
- Set task to \`in_progress\` BEFORE work starts. Max 1 \`in_progress\` task at a time.
- Mark \`completed\` immediately upon finishing.

Do not use for:
- Single trivial tasks, 1-2 step edits, informational responses.

Task format:
- \`content\`: imperative action ("Run tests")
- \`activeForm\`: continuous present ("Running tests")

States: \`pending\` -> \`in_progress\` -> \`completed\`.`

export const DESCRIPTION =
  'Manage session todo list. Track tasks, progress, and current in_progress work. Requires content (imperative) and activeForm (continuous).'
