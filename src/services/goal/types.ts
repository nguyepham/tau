// Objective goal loop (/goal). A goal is "done" iff a user-supplied check
// command exits 0 — no model judges completion, so there is no evaluator model
// call, no cache perturbation, and no provider-capability dependency. The loop
// runs the check after each main-thread turn and either stops (pass) or injects
// an append-only continuation nudge (fail), bounded by maxTurns.

export type GoalStatus = 'active' | 'paused' | 'achieved'

export type GoalState = {
  id: string
  // Human description of what "done" means (shown to the model + in status).
  description: string
  // Shell command whose exit code is the completion oracle (exit 0 = achieved).
  // Optional: when absent, the goal runs in self-report mode where the model
  // signals completion with a marker line and the turn limit is the backstop.
  checkCommand?: string
  status: GoalStatus
  // Number of completed continuation cycles. Bounded by maxTurns.
  turnCount: number
  maxTurns: number
  createdAt: string
  updatedAt: string
  // Terminal assistant uuid last evaluated — dedups re-entry on the same turn.
  lastCheckedUuid?: string
  // Tail of the most recent failing check output (fed into the next nudge).
  lastCheckOutput?: string
  achievedAt?: string
  pausedAt?: string
  pausedReason?: string
}

export type GoalCheckResult = {
  passed: boolean
  exitCode: number | null
  output: string
  timedOut: boolean
}
