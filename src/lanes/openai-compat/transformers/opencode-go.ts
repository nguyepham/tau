/**
 * OpenCode Go transformer (https://opencode.ai/zen/go/).
 *
 * Go is the same OpenCode gateway as Zen, sharing the same credential
 * (OPENCODE_API_KEY). The ONLY thing that changes is the base path:
 *   Zen → https://opencode.ai/zen/v1
 *   Go  → https://opencode.ai/zen/go/v1
 *
 * Everything else is identical to Zen — request shaping, reasoning/thinking
 * effort injection, the rate-limit UA gate + session-affinity headers, and
 * cache_control management. So we clone the Zen transformer wholesale and
 * override ONLY the identity, the default base URL, and the places where
 * Go's upstream differs from Zen (see below). Nothing is hardcoded: the model
 * list is live-fetched from `https://opencode.ai/zen/go/v1/models` (no
 * staticCatalog), exactly like Zen live-fetches `/zen/v1/models`.
 *
 * This file does NOT modify the Zen transformer; it spreads it, so any future
 * Zen fix flows to Go automatically.
 */

import type { Transformer, TransformContext } from './base.js'
import type { OpenAIChatRequest } from './shared_types.js'
import { opencodeTransformer } from './opencode.js'
import { supportsOpencodeThinkingSelection } from '../../../utils/model/opencodeThinking.js'

// Reasoning/thinking controls the Zen transformer may inject. OpenCode Go's
// GLM-5.2 and Qwen3.7-max upstreams validate `thinking` against Anthropic's
// ThinkingConfig and 400 on the zai-style shape Zen sends (`clear_thinking`,
// `type:'enabled'`). For models with no supported thinking *selection* on Go,
// strip every reasoning/thinking control and let the upstream use its own
// server-side default. supportsOpencodeThinkingSelection() is the single source
// of truth for which models that is.
const GO_UNSUPPORTED_THINKING_FIELDS = [
  'thinking',
  'reasoning',
  'reasoning_effort',
  'enable_thinking',
  'chat_template_args',
] as const

// Specific MiMo rows to hide from the Go catalog (mimo-v2.5-pro stays).
const GO_HIDDEN_MODEL_IDS = new Set([
  'mimo-v2-omni',
  'mimo-v2-pro',
  'mimo-v2.5',
])

// Go's Kimi upstream 400s ("Upstream request failed") on ANY request that
// carries the Zen detailed-usage flag `usage: { include: true }` — verified
// live 2026-07-11 against kimi-k2.5 and kimi-k2.6 (deterministic, 5/5).
// kimi-k2.7-code tolerates the flag, but Moonshot volunteers
// `prompt_tokens_details.cached_tokens` without it on every kimi row, so
// stripping the flag for the whole family loses no cache accounting and is
// robust to new kimi rows inheriting the stricter validation.
function goRejectsUsageIncludeFlag(model: string): boolean {
  return model.trim().toLowerCase().startsWith('kimi-')
}

export const opencodeGoTransformer: Transformer = {
  ...opencodeTransformer,
  id: 'opencodego',
  displayName: 'OpenCode Go',
  defaultBaseUrl: 'https://opencode.ai/zen/go/v1',

  transformRequest(
    body: OpenAIChatRequest,
    ctx: TransformContext,
  ): OpenAIChatRequest {
    // Reuse ALL of Zen's request shaping (session affinity, effort injection,
    // cache_control), then drop the thinking controls Go's GLM-5.2 / Qwen3.7-max
    // reject so the request validates instead of 400ing.
    const result = opencodeTransformer.transformRequest(body, ctx)
    if (!supportsOpencodeThinkingSelection('opencodego', result.model)) {
      const mutable = result as unknown as Record<string, unknown>
      for (const field of GO_UNSUPPORTED_THINKING_FIELDS) delete mutable[field]
    }
    if (goRejectsUsageIncludeFlag(result.model)) {
      delete (result as unknown as Record<string, unknown>).usage
    }
    return result
  },

  smallFastModel(model: string): string | null {
    // Zen's qwen mapping (qwen3.5-plus) is a bad fit on Go: live-probed
    // 2026-07-11, the row reports zero prompt-cache usage AND burns ~300
    // hidden reasoning tokens per call (server-side thinking default).
    // deepseek-v4-flash is Go's designated cheap tier (configs.ts haiku
    // default) and served ~99% of a repeated prefix from cache in the same
    // probe. Zen returns null for the deepseek family (Zen only hosts free
    // variants); on Go deepseek-v4-flash is a paid row, so map the family
    // there too instead of reusing an expensive main model.
    const m = model.toLowerCase()
    if (m.startsWith('qwen') || m.includes('deepseek')) return 'deepseek-v4-flash'
    return opencodeTransformer.smallFastModel!(model)
  },

  filterModelCatalog(
    models: Array<{ id: string; name?: string }>,
  ): Array<{ id: string; name?: string }> {
    return models.filter(
      model => !GO_HIDDEN_MODEL_IDS.has(model.id.trim().toLowerCase()),
    )
  },
}
