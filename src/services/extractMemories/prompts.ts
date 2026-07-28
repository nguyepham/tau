/**
 * Prompt templates for the background memory extraction agent.
 *
 * The extraction agent runs as a perfect fork of the main conversation — same
 * system prompt, same message prefix. The main agent's system prompt always
 * has full save instructions; when the main agent writes memories itself,
 * extractMemories.ts skips that turn (hasMemoryWritesSince). This prompt
 * fires only when the main agent didn't write, so the save-criteria here
 * overlap the system prompt's harmlessly.
 */

import { feature } from 'bun:bundle'
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  MEMORY_TYPES,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
} from '../../memdir/memoryTypes.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'

/**
 * Shared opener for both extract-prompt variants.
 */
function opener(newMessageCount: number, existingMemories: string): string {
  const manifest =
    existingMemories.length > 0
      ? `\n\n## Existing memory files\n\n${existingMemories}\n\nCheck list before writing. Update existing file rather than duplicate.`
      : ''
  return [
    `Memory extraction subagent. Analyze last ~${newMessageCount} messages => update persistent memory systems.`,
    '',
    `Allowed tools: ${FILE_READ_TOOL_NAME}, ${GREP_TOOL_NAME}, ${GLOB_TOOL_NAME}, read-only ${BASH_TOOL_NAME} (ls/find/cat/stat/wc/head/tail), ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME} for memory dir paths. ${BASH_TOOL_NAME} rm forbidden. Other tools denied.`,
    '',
    `Turn budget: turn 1 => parallel ${FILE_READ_TOOL_NAME} calls; turn 2 => parallel ${FILE_WRITE_TOOL_NAME}/${FILE_EDIT_TOOL_NAME} calls. Do not interleave across turns.`,
    '',
    `Use content from last ~${newMessageCount} messages only. Source verification, code grepping, git commands forbidden.`,
    '',
    'Capture critical, general lessons only (reusable principles for future sessions). Omit code, file paths, line numbers, routine fixes, code-derivable facts. No critical general lesson => save nothing.' +
      manifest,
  ].join('\n')
}

/**
 * Build the extraction prompt for auto-only memory (no team memory).
 * Four-type taxonomy, no scope guidance (single directory).
 */
export function buildExtractAutoOnlyPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  // Self-learning runs in REVIEW-BEFORE-USE mode: captured memories are
  // PROPOSALS staged in the `learned/` subdir and are NOT used until the user
  // approves them via /learned. The agent may only write inside `learned/`.
  void skipIndex // index step does not apply in staging mode
  const howToSave = [
    '## How to save proposals',
    '',
    'Save PROPOSALS for user review. Write proposed memory files inside `learned/` subdir (e.g. `learned/user_prefers_terse.md`). Writes outside `learned/` forbidden.',
    '',
    'Frontmatter format:',
    '',
    '```markdown',
    '---',
    'name: {{short-name}}',
    'description: {{one-line description}}',
    `type: {{${MEMORY_TYPES.join(', ')}}}`,
    'origin: learned',
    "learnedAt: {{today's date, YYYY-MM-DD}}",
    '---',
    '',
    '{{lesson content: rule/fact + **Why:** + **How to apply:**}}',
    '```',
    '',
    '- Frontmatter marker `origin: learned` mandatory on every file.',
    '- Editing `MEMORY.md` or writing outside `learned/` forbidden.',
    '- One file per distinct lesson. Organize by topic.',
    '- Skip items already in existing-memories list.',
  ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    'If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.',
    '',
    ...TYPES_SECTION_INDIVIDUAL,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '',
    ...howToSave,
  ].join('\n')
}

/**
 * Build the extraction prompt for combined auto + team memory.
 * Four-type taxonomy with per-type <scope> guidance (directory choice
 * is baked into each type block, no separate routing section needed).
 */
export function buildExtractCombinedPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  if (!feature('TEAMMEM')) {
    return buildExtractAutoOnlyPrompt(
      newMessageCount,
      existingMemories,
      skipIndex,
    )
  }

  const howToSave = skipIndex
    ? [
        '## How to save memories',
        '',
        "Write each memory to its own file in the chosen directory (private or team, per the type's scope guidance) using this frontmatter format:",
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- Organize memory semantically by topic, not chronologically',
        '- Update or remove memories that turn out to be wrong or outdated',
        '- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.',
      ]
    : [
        '## How to save memories',
        '',
        'Saving a memory is a two-step process:',
        '',
        "**Step 1** — write the memory to its own file in the chosen directory (private or team, per the type's scope guidance) using this frontmatter format:",
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        "**Step 2** — add a pointer to that file in the same directory's `MEMORY.md`. Each directory (private and team) has its own `MEMORY.md` index — each entry should be one line, under ~150 characters: `- [Title](file.md) — one-line hook`. They have no frontmatter. Never write memory content directly into a `MEMORY.md`.",
        '',
        '- Both `MEMORY.md` indexes are loaded into your system prompt — lines after 200 will be truncated, so keep them concise',
        '- Organize memory semantically by topic, not chronologically',
        '- Update or remove memories that turn out to be wrong or outdated',
        '- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    'If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.',
    '',
    ...TYPES_SECTION_COMBINED,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '- You MUST avoid saving sensitive data within shared team memories. For example, never save API keys or user credentials.',
    '',
    ...howToSave,
  ].join('\n')
}
