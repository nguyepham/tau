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
 * override ONLY the identity, the default base URL, and the two places where
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
    return result
  },

  filterModelCatalog(
    models: Array<{ id: string; name?: string }>,
  ): Array<{ id: string; name?: string }> {
    return models.filter(
      model => !GO_HIDDEN_MODEL_IDS.has(model.id.trim().toLowerCase()),
    )
  },
}
