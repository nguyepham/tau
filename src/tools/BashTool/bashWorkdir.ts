import { statSync } from 'fs'
import path from 'path'
import pathWin32 from 'path/win32'
import { getCwd } from '../../utils/cwd.js'
import { getPlatform } from '../../utils/platform.js'
import { posixPathToWindowsPath } from '../../utils/windowsPaths.js'

type Platform = ReturnType<typeof getPlatform>

export type BashExecutionWorkdirInput = {
  command: string
  workdir?: string
  command_parts?: unknown
  /**
   * Set when workdir was synthesized from a model-written leading `cd X && …`.
   * The model's mental model after writing that command is "the shell is now
   * in X", so BashTool persists the session cwd to X (within allowed working
   * paths) to mirror real shell semantics. Never set for an explicit workdir,
   * which is documented as a one-off override.
   */
  _workdirFromCd?: boolean
}

const LEADING_CD_RE =
  /^\s*cd\s+(?:--\s+)?((?:"(?:\\.|[^"\\])*")|'(?:[^']*)'|[^\s;&|]+)\s*&&\s*([\s\S]+?)\s*$/i

function pathApi(
  platform: Platform,
): typeof path.posix | typeof pathWin32 {
  return platform === 'windows' ? pathWin32 : path.posix
}

function isExistingDirectory(
  target: string,
  platform: Platform,
): boolean {
  try {
    return statSync(normalizeForHostFs(target, platform)).isDirectory()
  } catch {
    return false
  }
}

function pathEndsWith(
  target: string,
  suffixParts: string[],
  platform: Platform,
): boolean {
  if (suffixParts.length === 0) return false
  const api = pathApi(platform)
  const targetParts = api
    .resolve(target)
    .split(/[\\/]+/)
    .filter(Boolean)
  if (suffixParts.length > targetParts.length) return false
  const offset = targetParts.length - suffixParts.length
  return suffixParts.every((part, index) => {
    const actual = targetParts[offset + index]
    return platform === 'windows'
      ? actual?.toLowerCase() === part.toLowerCase()
      : actual === part
  })
}

/**
 * Recover the common "cwd suffix was repeated" mistake without guessing a
 * different project. Example:
 *
 *   cwd:       C:\repo\sd\ef
 *   requested: sd/ef
 *   lexical:   C:\repo\sd\ef\sd\ef
 *
 * If the lexical directory exists, it always wins. Otherwise, only collapse to
 * the nearest existing ancestor when the missing suffix exactly repeats that
 * ancestor's own suffix. This is host/path-shape based, not machine-specific.
 */
function recoverRepeatedWorkdirSuffix(
  candidate: string,
  platform: Platform,
): string {
  const api = pathApi(platform)
  const absolute = api.resolve(candidate)
  if (isExistingDirectory(absolute, platform)) return absolute

  const missingParts: string[] = []
  let ancestor = absolute
  for (let depth = 0; depth < 40; depth++) {
    const parent = api.dirname(ancestor)
    if (parent === ancestor) break
    missingParts.unshift(api.basename(ancestor))
    ancestor = parent
    if (!isExistingDirectory(ancestor, platform)) continue
    return pathEndsWith(ancestor, missingParts, platform) ? ancestor : absolute
  }
  return absolute
}

/**
 * Translate shell-facing absolute path spellings into host fs spellings.
 * On Windows this lets Node validate Git Bash paths like /c/Users/...,
 * while non-Windows hosts keep /c/... as a real POSIX path.
 */
export function normalizeForHostFs(
  target: string,
  platform: Platform = getPlatform(),
): string {
  if (platform !== 'windows') return target
  if (!/^(\/[a-zA-Z]\/|\/cygdrive\/|\/\/)/.test(target)) return target
  try {
    return posixPathToWindowsPath(target)
  } catch {
    return target
  }
}

export function resolveBashPathFrom(
  baseDir: string,
  target: string,
  platform: Platform = getPlatform(),
): string {
  const fsTarget = normalizeForHostFs(target, platform)
  const api = pathApi(platform)
  return api.isAbsolute(fsTarget) ? fsTarget : api.resolve(baseDir, fsTarget)
}

/**
 * Compare two directory spellings for cwd-equality. Tolerates Git Bash vs
 * native spellings, trailing separators, and case differences on Windows.
 * Used for "did the cwd actually move?" checks — not for security decisions.
 */
export function isSameBashCwd(
  a: string,
  b: string,
  platform: Platform = getPlatform(),
): boolean {
  const api = pathApi(platform)
  const ra = api.resolve(normalizeForHostFs(a, platform))
  const rb = api.resolve(normalizeForHostFs(b, platform))
  return platform === 'windows'
    ? ra.toLowerCase() === rb.toLowerCase()
    : ra === rb
}

export function resolveEffectiveBashCwd(
  input: Pick<BashExecutionWorkdirInput, 'workdir'>,
  cwd = getCwd(),
  platform: Platform = getPlatform(),
): string {
  return input.workdir
    ? resolveBashPathFrom(cwd, input.workdir, platform)
    : cwd
}

function unquoteShellToken(token: string): string {
  const trimmed = token.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(["\\$`])/g, '$1')
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function isDynamicCdTarget(target: string): boolean {
  return (
    target === '' ||
    target === '-' ||
    target.startsWith('~') ||
    /[$`*?[{]/.test(target)
  )
}

export function extractLeadingCdCommand(
  command: string,
): { target: string; remainder: string } | null {
  const match = LEADING_CD_RE.exec(command)
  if (!match?.[1] || !match[2]?.trim()) return null

  const target = unquoteShellToken(match[1])
  if (isDynamicCdTarget(target)) return null
  return { target, remainder: match[2].trim() }
}

export function normalizeBashExecutionInput<T extends BashExecutionWorkdirInput>(
  input: T,
  cwd = getCwd(),
  platform: Platform = getPlatform(),
): T {
  if (input.command_parts) return input

  let command = input.command
  let workdir = input.workdir
    ? recoverRepeatedWorkdirSuffix(
        resolveBashPathFrom(cwd, input.workdir, platform),
        platform,
      )
    : undefined
  let changed = false
  let convertedCd = false

  if (workdir !== input.workdir) changed = true

  for (let i = 0; i < 10; i++) {
    const leadingCd = extractLeadingCdCommand(command)
    if (!leadingCd) break

    const baseDir = resolveEffectiveBashCwd({ workdir }, cwd, platform)
    workdir = resolveBashPathFrom(baseDir, leadingCd.target, platform)
    command = leadingCd.remainder
    changed = true
    convertedCd = true
  }

  if (convertedCd && workdir) {
    workdir = recoverRepeatedWorkdirSuffix(workdir, platform)
  }

  return changed
    ? ({
        ...input,
        command,
        workdir,
        _workdirFromCd: convertedCd ? true : input._workdirFromCd,
      } as T)
    : input
}

export function normalizeBashExecutionInputInPlace<
  T extends BashExecutionWorkdirInput,
>(
  input: T,
  cwd = getCwd(),
  platform: Platform = getPlatform(),
): T {
  const normalized = normalizeBashExecutionInput(input, cwd, platform)
  if (normalized !== input) {
    input.command = normalized.command
    input.workdir = normalized.workdir
    input._workdirFromCd = normalized._workdirFromCd
  }
  return input
}
