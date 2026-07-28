import { getAutoMemLearnedPath, getAutoMemPath } from '../../memdir/paths.js'

/**
 * Agent instructions for each /learned action. The native /learned menu
 * (learned.tsx) renders the navigable list; once the user picks an action it
 * hands off to the hidden /learned-run command, which injects the matching
 * prompt below so the main agent does the work with full session context.
 *
 * Save model (one-step): when the user Approves a lesson, it is written
 * straight to ACTIVE memory — a topic file marked `origin: learned` plus a
 * one-line MEMORY.md pointer — and used from the next session on. There is no
 * separate "promote" step; the interactive approval IS the gate.
 *
 * Lessons are ALWAYS a single bullet — critical, general, and reusable across
 * future projects. NEVER specific code, file paths, line numbers, or routine
 * fixes.
 */

export const ACTIONS = ['view', 'learn', 'edit', 'delete'] as const
export type LearnedAction = (typeof ACTIONS)[number]

export function isLearnedAction(s: string): s is LearnedAction {
  return (ACTIONS as readonly string[]).includes(s)
}

/** The bar every lesson must clear. Shared by the menu actions and the
 * end-of-task offer so "what counts as a lesson" is defined in one place. */
export const LESSON_QUALITY_BAR = `## Lesson criteria
Lesson = single concentrated portable bullet. Critical + general principle for future projects.

Save:
- Framework/library tradeoffs (React vs HTML, server vs client rendering, hook pitfalls).
- Bug class prevention (stale closures, timezone issues, off-by-one errors).
- Runtime/API gotchas or hard constraints.
- Architecture principles + user preferences.

Omit:
- Project trivia, one-off fixes, routine steps, code-obvious facts, specific file paths/line numbers/symbols.
- No general lesson => save nothing.`

/** Shared header with the live active-memory path. */
function header(): string {
  const activeDir = getAutoMemPath()
  return `# Self-Learning

Active memory dir: \`${activeDir}\`. Approved lessons live as topic files with \`origin: learned\` in frontmatter + \`MEMORY.md\` pointer. Active from next session.

Manage learned lessons only. Resume/continue other tasks forbidden. Do specified action then stop.`
}

const SHARED_RULES = `## Rules
- Confirm before deleting or overwriting.
- Approved lesson = topic file with \`origin: learned\` + one-line \`MEMORY.md\` pointer (\`- [Title](file.md) - hook\`, <150 chars).
- Touch \`origin: learned\` files only. User memory edits forbidden without explicit ask.`

const PROMPTS: Record<LearnedAction, () => string> = {
  view: () => {
    const stagingDir = getAutoMemLearnedPath()
    return `${header()}

## Task: list active lessons
List active lessons (\`origin: learned\` files) as concise bullets (general takeaways).

Check \`${stagingDir}\` for leftover staged proposals. Leftovers present => list under **Leftover proposals** + offer activate or delete. Empty/missing => ignore.

${SHARED_RULES}`
  },

  learn: () => `${header()}

## Task: extract session lessons
Extract lessons clearing criteria below. Nothing clears criteria => say so plainly + save nothing.

${LESSON_QUALITY_BAR}

Candidate lesson => present single bullet + call AskUserQuestion (max 4 options: Approve, Edit wording, Skip).

One lesson per AskUserQuestion call. Approved/edited lesson => save topic file in active memory dir (\`origin: learned\`, \`learnedAt: YYYY-MM-DD\`) + add one-line \`MEMORY.md\` pointer.

${SHARED_RULES}`,

  edit: () => `${header()}

## Task: edit lesson
List active lessons (\`origin: learned\` files) as numbered list. AskUserQuestion forbidden for this list. User picks number/name => show content, apply requested change, sync \`MEMORY.md\` pointer, maintain portable bullet format.

${LESSON_QUALITY_BAR}

${SHARED_RULES}`,

  delete: () => `${header()}

## Task: delete lesson
List active lessons (\`origin: learned\` files) as numbered list. AskUserQuestion forbidden for this list. User picks targets => confirm, delete file(s), remove matching \`MEMORY.md\` pointer line(s).

${SHARED_RULES}`,
}

export const HELP_TEXT = `/learned — review and manage what Tau learns automatically.

Usage:
  /learned            open the menu (navigate with ↑/↓, Enter to pick, Esc to cancel)
  /learned view       show every saved lesson
  /learned learn      capture lessons from this session
  /learned edit       reword a saved lesson
  /learned delete     remove a lesson
  /learned toggle     turn self-learning on/off (on|off also work)

Approve a lesson and it's saved and used from the next session — no extra promote step.
Lessons are always a single critical, general, reusable bullet — never specific code or file paths.`

/** Build the agent prompt for a given action, or help text for an unknown one. */
export function buildLearnedPrompt(action: string): string {
  const key = action.trim().toLowerCase()
  if (isLearnedAction(key)) {
    return PROMPTS[key]()
  }
  return `Unknown /learned action: \`${action}\`.\n\n${HELP_TEXT}`
}
