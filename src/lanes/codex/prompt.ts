/**
 * Codex Lane — Native System Prompt
 *
 * Builds the system prompt in Codex CLI's native structure.
 * Key differences from Anthropic/Gemini:
 *   - apply_patch as the primary edit tool (not Edit, not replace)
 *   - Plan-then-execute workflow
 *   - Concise, direct instructions (Codex prompt is shorter than others)
 */

import type { SystemPromptParts } from '../types.js'
import {
  type StableSlot,
  type VolatileSlot,
  stableFrom,
  renderVolatileSlot,
  flatten,
} from '../shared/system_slots.js'

/**
 * Codex-native lane preamble. Based on the captured Codex CLI system
 * prompt (reference/system-prompts-and-models-of-ai-tools-main/Open
 * Source prompts/Codex CLI/openai-codex-cli-system-prompt-20250820.txt)
 * distilled to the parts that matter for tool-heavy agent work.
 *
 * apply_patch is the primary edit primitive — it's a Freeform tool with
 * a Lark grammar (codex-rs/tools/src/apply_patch_tool.rs), not a JSON
 * function. The prompt reflects that.
 */
const CODEX_LANE_PREAMBLE = [
  `Codex coding agent in Tau terminal. Pair-programming to read, edit, verify code. Concise, direct.`,

  `## Plan
Non-trivial work => state plan (1-3 sentences) before tool calls. Simple queries => answer directly. Multi-phase tasks => update_plan.`,

  `## Editing files — apply_patch
Use apply_patch for in-place edits. Patch format:

*** Begin Patch
*** Add File: path/to/new.ts
+content line
*** Update File: path/to/existing.ts
@@ context anchor
 unchanged line
-removed line
+added line
*** Delete File: path/to/gone.ts
*** End Patch

Require unique context anchors. Add File for new files; Update File for existing.`,

  `## Approach
1. Read before editing.
2. Targeted minimal edits.
3. Verify changes.
4. No single-use abstractions.
5. Diagnose tool/shell failures (exit code, error output) before retrying. Max 1 focused retry attempt. Stop after 2 failures.
6. Check \`--help\` or docs before invoking unfamiliar CLIs.`,

  `## Style
- No restating comments, speculative error handling, or unrelated refactoring.
- Cite file paths + line numbers.`,
].join('\n\n')

/**
 * Assemble the Codex system prompt. Returns the cache-safe stable/
 * volatile split so the Responses API's prompt_cache_key points at a
 * byte-identical stable prefix across turns.
 */
export function assembleCodexSystemPrompt(
  _model: string,
  parts: SystemPromptParts,
): { stable: StableSlot; volatile: VolatileSlot; full: string } {
  const stable = stableFrom(CODEX_LANE_PREAMBLE, parts)
  const volatile = renderVolatileSlot(parts)
  const full = flatten(stable, volatile)
  return { stable, volatile, full }
}
