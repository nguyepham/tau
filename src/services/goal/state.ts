import { randomUUID } from 'crypto'

import type { GoalState } from './types.js'

export const DEFAULT_GOAL_MAX_TURNS = 15
export const MAX_GOAL_DESCRIPTION_CHARS = 2_000
export const MAX_GOAL_CHECK_CHARS = 2_000

export function nowIso(): string {
  return new Date().toISOString()
}

function stripQuotes(input: string): string {
  const trimmed = input.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export type ParsedGoalArgs =
  | { ok: true; description: string; checkCommand?: string }
  | { ok: false; error: string }

/**
 * Parses `<description> [--check <command>]`. Everything before `--check` is the
 * description; everything after is the command (the rest of the string, so the
 * command may itself contain spaces and flags). Both may be quoted.
 *
 * `--check` is optional. When omitted the whole input is the description and the
 * goal runs in self-report mode. When present the command must be non-empty (a
 * bare `--check` is a typo, not a request for self-report mode).
 */
export function parseGoalArgs(raw: string): ParsedGoalArgs {
  const marker = /(^|\s)--check(\s|=|$)/.exec(raw)

  if (!marker) {
    const description = stripQuotes(raw)
    if (!description) {
      return { ok: false, error: 'Goal description cannot be empty.' }
    }
    if (description.length > MAX_GOAL_DESCRIPTION_CHARS) {
      return {
        ok: false,
        error: `Goal description must be ${MAX_GOAL_DESCRIPTION_CHARS} characters or fewer.`,
      }
    }
    return { ok: true, description }
  }

  const splitAt = marker.index + marker[1].length
  const description = stripQuotes(raw.slice(0, splitAt))
  // '--check'.length skips the flag, +1 skips the following space or '='.
  const checkCommand = stripQuotes(raw.slice(splitAt + '--check'.length + 1))

  if (!description) {
    return { ok: false, error: 'Goal description cannot be empty.' }
  }
  if (description.length > MAX_GOAL_DESCRIPTION_CHARS) {
    return {
      ok: false,
      error: `Goal description must be ${MAX_GOAL_DESCRIPTION_CHARS} characters or fewer.`,
    }
  }
  if (!checkCommand) {
    return {
      ok: false,
      error:
        'Check command cannot be empty. Drop --check entirely to let the agent self-report completion.',
    }
  }
  if (checkCommand.length > MAX_GOAL_CHECK_CHARS) {
    return {
      ok: false,
      error: `Check command must be ${MAX_GOAL_CHECK_CHARS} characters or fewer.`,
    }
  }
  return { ok: true, description, checkCommand }
}

export function createGoalState(
  description: string,
  checkCommand: string | undefined,
  now: string = nowIso(),
  maxTurns = DEFAULT_GOAL_MAX_TURNS,
): GoalState {
  const trimmedCheck = checkCommand?.trim()
  return {
    id: randomUUID(),
    description: description.trim(),
    checkCommand: trimmedCheck ? trimmedCheck : undefined,
    status: 'active',
    turnCount: 0,
    maxTurns,
    createdAt: now,
    updatedAt: now,
  }
}

export function pauseGoal(
  goal: GoalState,
  reason?: string,
  now: string = nowIso(),
): GoalState {
  if (goal.status !== 'active') return goal
  return {
    ...goal,
    status: 'paused',
    pausedAt: now,
    pausedReason: reason,
    updatedAt: now,
  }
}

export function resumeGoal(goal: GoalState, now: string = nowIso()): GoalState {
  if (goal.status !== 'paused') return goal
  return {
    ...goal,
    status: 'active',
    pausedAt: undefined,
    pausedReason: undefined,
    updatedAt: now,
    // Fresh budget on resume, and re-arm evaluation on the next turn.
    turnCount: 0,
    lastCheckedUuid: undefined,
  }
}

export function achieveGoal(
  goal: GoalState,
  evaluatedUuid: string,
  now: string = nowIso(),
): GoalState {
  return {
    ...goal,
    status: 'achieved',
    achievedAt: now,
    updatedAt: now,
    turnCount: goal.turnCount + 1,
    lastCheckedUuid: evaluatedUuid,
  }
}

export function recordFailedCheck(
  goal: GoalState,
  evaluatedUuid: string,
  output: string,
  now: string = nowIso(),
): GoalState {
  return {
    ...goal,
    updatedAt: now,
    turnCount: goal.turnCount + 1,
    lastCheckedUuid: evaluatedUuid,
    lastCheckOutput: output,
  }
}
