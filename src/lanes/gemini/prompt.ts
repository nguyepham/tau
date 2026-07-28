/**
 * Gemini Lane — Native System Prompt Assembly
 *
 * Builds the system prompt in the structure Gemini was post-trained on.
 * The template matches gemini-cli's prompt layout (from packages/core/src/prompts/).
 *
 * Sections:
 *   1. Preamble — agent identity and mode
 *   2. Core Mandates — security and engineering standards
 *   3. Workflows — research → strategy → execution
 *   4. Tool Usage — how to use each tool effectively
 *   5. Operational Guidelines — tone, style, conventions
 *   6. Git Repository — git workflow if applicable
 *   7. Memory/Context — injected from Tau shared layer
 *   8. Environment — volatile per-turn info (cwd, date, git status)
 *
 * Sections 1-6 are STABLE (cacheable). Sections 7-8 are VOLATILE.
 * The boundary is marked so the Gemini cache manager hashes only stable content.
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

// ─── Model-Family Detection ──────────────────────────────────────

type GeminiFamily = 'gemini-3' | 'default-legacy'

function detectFamily(model: string): GeminiFamily {
  const m = model.toLowerCase()
  if (/gemini-3(\.|-|$)/.test(m) || /gemini-4/.test(m)) return 'gemini-3'
  return 'default-legacy'
}

// ─── Stable Prompt Sections ──────────────────────────────────────

function preamble(family: GeminiFamily): string {
  return `Interactive AI coding agent pair-programming with user. Gather context efficiently, then respond.`
}

function coreMandates(): string {
  return `## Core Mandates

### Security
- Never expose credentials/secrets.
- Never execute data exfiltration/destructive commands. Explain risk + safe alternative.

### Engineering
- Clean, idiomatic code matching project patterns.
- Prefer editing existing files. Test changes. No unnecessary complexity/comments.`
}

function workflows(family: GeminiFamily): string {
  if (family === 'gemini-3') {
    return `## Workflow
1. Research (read files/search)
2. Strategy (plan)
3. Execute (changes + test)
4. Report (concise summary)

Use \`enter_plan_mode\` for complex tasks.`
  }

  return `## Workflow
1. Research -> 2. Plan -> 3. Execute -> 4. Verify -> 5. Report`
}

function toolUsageGuidelines(): string {
  return `## Tool Usage
- **read_file**: read before editing. Use start_line/end_line for large files.
- **replace**: 3+ lines context in old_string. Read file first.
- **run_shell_command**: describe purpose. Prefer dedicated tools over shell equivalents.
- **grep_search**: search code content.
- **glob**: find files.
- **google_web_search**: ${WEB_SEARCH_AUTO_USE_GUIDANCE}
- **web_fetch**: read URLs.

Do not re-read unchanged files. Answer from context when possible.`
}

function operationalGuidelines(): string {
  return `## Guidelines
- Concise responses. No filler or unsolicited refactoring.
- Cite file paths + line numbers.
- Unsure => ask user.
- Tool failure => diagnose exit code/error text, make 1 focused retry attempt. Stop after 2 failures.
- Shell commands: run directly. User paste \`! <cmd>\` only for interactive auth/TUI.
- Use subagents for broad research/parallel work.`
}

function gitRepoSection(): string {
  return `## Git Repository
- Read diffs/status before committing.
- Clear commit messages.
- New commits over amending.
- Confirm before destructive/force operations.`
}

// ─── Full Prompt Assembly ────────────────────────────────────────

/**
 * Assemble the complete Gemini system prompt.
 *
 * Returns `{ stable, volatile }` — only the stable slot may feed the
 * Gemini `cachedContents` key; the volatile slot goes inline as a
 * leading user message so the cache key stays byte-identical across
 * turns when only env/git/memory change.
 */
export function assembleGeminiSystemPrompt(
  model: string,
  parts: SystemPromptParts,
): { stable: StableSlot; volatile: VolatileSlot; full: string } {
  const family = detectFamily(model)

  // Lane preamble = preamble + mandates + workflow + tool-usage +
  // guidelines + git-section. Same every turn; belongs in cache key.
  const lanePreamble = [
    preamble(family),
    coreMandates(),
    workflows(family),
    toolUsageGuidelines(),
    operationalGuidelines(),
    gitRepoSection(),
  ].join('\n\n')

  // Stable slot: lane preamble + user/project stable additions
  // (customInstructions, toolsAddendum, mcpIntro, skillsContext).
  const stable = stableFrom(lanePreamble, parts)

  // Volatile slot: memory + environment + git status.
  const volatile = renderVolatileSlot(parts)

  // `full` keeps the flat form for lanes/paths that can't carry the
  // split (e.g. non-cached legacy shim path). No boundary marker —
  // that was a Claude-Code leak; Gemini doesn't read it.
  const full = flatten(stable, volatile)

  return { stable, volatile, full }
}

/**
 * Build the `systemInstruction` field for the Gemini API using ONLY
 * the stable slot — so its bytes match across turns and `cachedContents`
 * can hit. The volatile slot travels as a leading user message and is
 * wired separately by the lane's request builder.
 */
export function buildGeminiSystemInstruction(
  model: string,
  parts: SystemPromptParts,
): { parts: Array<{ text: string }> } {
  const { stable } = assembleGeminiSystemPrompt(model, parts)
  return { parts: [{ text: stable }] }
}

/**
 * Legacy/debug helper: flat system prompt with stable+volatile joined.
 * Lanes/paths that can't carry the split use this; they forgo caching.
 */
export function buildFlatGeminiSystemPrompt(
  model: string,
  parts: SystemPromptParts,
): string {
  const { full } = assembleGeminiSystemPrompt(model, parts)
  return full
}
