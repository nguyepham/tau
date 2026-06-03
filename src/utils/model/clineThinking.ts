import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type ClineEffort = 'none' | 'low' | 'medium' | 'high'
export type ClineWireEffort = Exclude<ClineEffort, 'none'>

export const CLINE_EFFORT_LEVELS: readonly ClineEffort[] = [
  'none',
  'low',
  'medium',
  'high',
]

function storePath(): string {
  return process.env.TAU_CLINE_THINKING_STORE
    || join(homedir(), '.claude', 'cline-thinking.json')
}

let _loadedPath: string | null = null
let _cache: Record<string, ClineEffort> = {}

function normalizeStoreKey(model: string): string {
  return model.trim().toLowerCase()
}

function load(): void {
  const path = storePath()
  if (_loadedPath === path) return
  _loadedPath = path
  _cache = {}

  try {
    if (!existsSync(path)) return
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

    const next: Record<string, ClineEffort> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof value === 'string'
        && (CLINE_EFFORT_LEVELS as readonly string[]).includes(value)
      ) {
        next[key.toLowerCase()] = value as ClineEffort
      }
    }
    _cache = next
  } catch {
    // Persistence is best-effort. A stale/corrupt file should not break the picker.
  }
}

function save(): void {
  const path = storePath()
  try {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify(_cache, null, 2), 'utf8')
  } catch {
    // Keep the in-memory value for this session even if disk persistence fails.
  }
}

export function isClineThinkingModel(model: string): boolean {
  const m = model.trim().toLowerCase().replace(/[._]/g, '-')

  if (!m) return false
  if (m.includes('thinking') || m.includes('reasoning')) return true

  // Cline's model catalog should be authoritative when it exposes
  // supportsReasoning. These families are the conservative fallback for
  // fallback catalogs and older API payloads.
  if (m.includes('deepseek-r1') || m.includes('deepseek/deepseek-r')) return true
  if (m.includes('deepseek-v4') || m.includes('deepseek-reasoner')) return true
  if (m.includes('qwq') || m.includes('qwen3') || m.includes('qwen-3')) return true
  if (m.includes('glm-5') || m.includes('glm-4-7') || m.includes('glm-4-6')) return true
  if (m.includes('kimi-k2-thinking') || m.includes('kimi-k2-5') || m.includes('kimi-k2p5')) return true
  if (m.includes('minimax-m2')) return true
  if (m.includes('grok-3') || m.includes('grok-4') || m.includes('xai/grok-3') || m.includes('xai/grok-4')) return true
  if (m.includes('gemini-2-5') || m.includes('gemini-3')) return true
  if (m.includes('claude-sonnet-4') || m.includes('claude-opus-4') || m.includes('claude-haiku-4')) return true
  if (m.includes('gpt-5') || m.includes('codex')) return true
  if (m.includes('/o1') || m.includes('/o3') || m.includes('/o4')) return true
  if (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return true

  return false
}

export function supportsClineThinkingSelection(
  model: string,
  tags?: readonly string[],
): boolean {
  if (tags?.some(tag => tag === 'thinking' || tag === 'reasoning')) return true
  return isClineThinkingModel(model)
}

export function getClineEffort(model: string): ClineEffort {
  load()
  return _cache[normalizeStoreKey(model)] ?? 'none'
}

export function setClineEffort(model: string, effort: ClineEffort): void {
  load()
  const key = normalizeStoreKey(model)
  if (effort === 'none') {
    delete _cache[key]
  } else {
    _cache[key] = effort
  }
  save()
}

export function cycleClineEffort(
  model: string,
  direction: 'left' | 'right',
): ClineEffort {
  const current = getClineEffort(model)
  const idx = CLINE_EFFORT_LEVELS.indexOf(current)
  const len = CLINE_EFFORT_LEVELS.length
  const next =
    direction === 'right'
      ? CLINE_EFFORT_LEVELS[(idx + 1) % len]!
      : CLINE_EFFORT_LEVELS[(idx - 1 + len) % len]!
  setClineEffort(model, next)
  return next
}

export function getClineEffortLabel(effort: ClineEffort): string {
  return effort === 'none'
    ? 'Off'
    : effort.charAt(0).toUpperCase() + effort.slice(1)
}

export function getClineRequestEffort(model: string): ClineWireEffort | null {
  const effort = getClineEffort(model)
  return effort === 'none' ? null : effort
}

export function applyClineReasoningToRequest(
  body: Record<string, unknown>,
  effort: ClineWireEffort | null,
): void {
  if (!effort) {
    body.reasoning = { enabled: false }
    delete body.reasoning_effort
    return
  }

  body.reasoning = { enabled: true, effort }
  body.reasoning_effort = effort
}

export function _resetClineThinkingForTests(
  cache: Record<string, ClineEffort> = {},
): void {
  _loadedPath = storePath()
  _cache = { ...cache }
}
