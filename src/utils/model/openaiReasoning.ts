/**
 * Global reasoning effort store for OpenAI Codex models.
 *
 * The model picker writes the user's chosen level here; the OpenAI
 * provider reads it at request time.
 */

export type OpenAIReasoningLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const STANDARD_REASONING_LEVELS: readonly OpenAIReasoningLevel[] = [
  'low',
  'medium',
  'high',
  'xhigh',
]

const GPT_5_6_REASONING_LEVELS: readonly OpenAIReasoningLevel[] = [
  ...STANDARD_REASONING_LEVELS,
  'max',
]

const GPT_5_6_MODELS = new Set([
  'gpt-5.6',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
])

const REASONING_LABELS: Record<OpenAIReasoningLevel, string> = {
  low:    'Low',
  medium: 'Medium',
  high:   'High',
  xhigh:  'Extra High',
  // The API value is `max`; "Ultra" is the picker-facing name requested for
  // the GPT-5.6-only top tier.
  max:    'Ultra',
}

let _currentLevel: OpenAIReasoningLevel = 'medium'

/** True once the user has explicitly picked a level via ← → in the picker. */
let _explicitlySet = false

export function getOpenAIReasoningLevel(modelId?: string): OpenAIReasoningLevel {
  if (!modelId) return _currentLevel

  const levels = getAllReasoningLevels(modelId)
  return levels.includes(_currentLevel)
    ? _currentLevel
    : levels[levels.length - 1]!
}

/** Whether the user has explicitly chosen a reasoning level. */
export function isReasoningLevelExplicit(): boolean {
  return _explicitlySet
}

export function setOpenAIReasoningLevel(level: OpenAIReasoningLevel): void {
  _currentLevel = level
  _explicitlySet = true
}

export function cycleOpenAIReasoningLevel(
  direction: 'left' | 'right',
  modelId?: string,
): OpenAIReasoningLevel {
  const levels = getAllReasoningLevels(modelId)
  const currentLevel = levels.includes(_currentLevel)
    ? _currentLevel
    : levels[levels.length - 1]!
  const idx = levels.indexOf(currentLevel)
  if (direction === 'right') {
    _currentLevel = levels[(idx + 1) % levels.length]!
  } else {
    _currentLevel = levels[(idx - 1 + levels.length) % levels.length]!
  }
  _explicitlySet = true
  return _currentLevel
}

export function getReasoningLabel(level: OpenAIReasoningLevel): string {
  return REASONING_LABELS[level]
}

export function getAllReasoningLevels(modelId?: string): readonly OpenAIReasoningLevel[] {
  return modelId && modelSupportsMaxReasoning(modelId)
    ? GPT_5_6_REASONING_LEVELS
    : STANDARD_REASONING_LEVELS
}

/** GPT-5.6 exposes the API's additional `max` reasoning effort. */
export function modelSupportsMaxReasoning(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase().replace(/^openai\//, '')
  return GPT_5_6_MODELS.has(normalized)
}

/**
 * Check if an OpenAI model supports reasoning_effort.
 * GPT-5 family + o-series reasoning models.
 */
export function modelSupportsReasoning(modelId: string): boolean {
  return /^(o[1-9](-|$)|o[1-9][0-9]?(-mini|-pro)?|gpt-[5-9])/i.test(modelId)
}
