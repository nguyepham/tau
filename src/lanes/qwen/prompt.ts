/**
 * Qwen lane — native system prompt assembly.
 *
 * Based on reference/qwen-code-main/packages/core/src/prompts/snippets.ts
 * (Qwen3-Coder adaptations) plus the cross-lane StableSlot/VolatileSlot
 * discipline from shared/system_slots.ts.
 */

import type { SystemPromptParts } from '../types.js'
import {
  type StableSlot,
  type VolatileSlot,
  stableFrom,
  renderVolatileSlot,
  flatten,
} from '../shared/system_slots.js'
import { WEB_SEARCH_AUTO_USE_GUIDANCE } from '../../tools/WebSearchTool/prompt.js'

// ─── Stable preamble ──────────────────────────────────────────────

function preamble(): string {
  return `Qwen Coder CLI agent. Pair-program with user to read, edit, verify code. Gather context before acting.`
}

function coreMandates(): string {
  return `## Core Mandates
- Follow project conventions.
- Verify library/framework availability before assuming.
- Prefer editing existing files.
- Never commit secrets/credentials.
- Multiple options => state tradeoffs.
- Unsure => search/read code.`
}

function workflow(): string {
  return `## Workflow
1. Understand (read/search) -> 2. Plan (1-3 sentences for complex tasks) -> 3. Execute (targeted edits) -> 4. Verify -> 5. Summarize`
}

function toolUsage(): string {
  return `## Tool Usage
- 'read_file': read before editing. Use offset/limit for large files.
- 'edit_file': unique context in old_string.
- 'run_shell_command': include description. Prefer native tools over shell equivalents.
- 'search_file_content': search content.
- 'glob': find files.
- 'web_search': ${WEB_SEARCH_AUTO_USE_GUIDANCE}
- 'web_fetch': fetch URL.

Do not re-read unchanged files.`
}

function operational(): string {
  return `## Style
- Concise. Omit narration.
- Cite file paths + line numbers.
- No unsolicited refactoring, restating comments, or dead error handling.
- Tool failure => diagnose exit code/error text, make 1 focused retry attempt. Stop after 2 failures.
- Unfamiliar CLIs => check \`--help\` once.`
}

function git(): string {
  return `## Git
Check status/diff before committing. Clear commit messages. Confirm before force push.`
}

// ─── Assembly ────────────────────────────────────────────────────

export function assembleQwenSystemPrompt(
  model: string,
  parts: SystemPromptParts,
): { stable: StableSlot; volatile: VolatileSlot; full: string } {
  const lanePreamble = [
    preamble(),
    coreMandates(),
    workflow(),
    toolUsage(),
    operational(),
    git(),
  ].join('\n\n')
  const stable = stableFrom(lanePreamble, parts)
  const volatile = renderVolatileSlot(parts)
  const full = flatten(stable, volatile)
  return { stable, volatile, full }
}
