import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../../services/analytics/growthbook.js'
import { DEFAULT_CRON_JITTER_CONFIG } from '../../utils/cronTasks.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const KAIROS_CRON_REFRESH_MS = 5 * 60 * 1000

export const DEFAULT_MAX_AGE_DAYS =
  DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs / (24 * 60 * 60 * 1000)

/**
 * Unified gate for the cron scheduling system. Combines the build-time
 * `feature('AGENT_TRIGGERS')` flag (dead code elimination) with the runtime
 * `tengu_kairos_cron` GrowthBook gate on a 5-minute refresh window.
 *
 * AGENT_TRIGGERS is independently shippable from KAIROS — the cron module
 * graph (cronScheduler/cronTasks/cronTasksLock/cron.ts + the three tools +
 * /loop skill) has zero imports into src/assistant/ and no feature('KAIROS')
 * calls. The REPL.tsx kairosEnabled read is safe:
 * kairosEnabled is unconditionally in AppStateStore with default false, so
 * when KAIROS is off the scheduler just gets assistantMode: false.
 *
 * Called from Tool.isEnabled() (lazy, post-init) and inside useEffect /
 * imperative setup, never at module scope — so the disk cache has had a
 * chance to populate.
 *
 * The default is `true` — /loop is GA (announced in changelog). GrowthBook
 * is disabled for Bedrock/Vertex/Foundry and when DISABLE_TELEMETRY /
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC are set; a `false` default would
 * break /loop for those users (GH #31759). The GB gate now serves purely as
 * a fleet-wide kill switch — flipping it to `false` stops already-running
 * schedulers on their next isKilled poll tick, not just new ones.
 *
 * `CLAUDE_CODE_DISABLE_CRON` is a local override that wins over GB.
 */
export function isKairosCronEnabled(): boolean {
  return feature('AGENT_TRIGGERS')
    ? !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_CRON) &&
        getFeatureValue_CACHED_WITH_REFRESH(
          'tengu_kairos_cron',
          true,
          KAIROS_CRON_REFRESH_MS,
        )
    : false
}

/**
 * Kill switch for disk-persistent (durable) cron tasks. Narrower than
 * {@link isKairosCronEnabled} — flipping this off forces `durable: false` at
 * the call() site, leaving session-only cron (in-memory, GA) untouched.
 *
 * Defaults to `true` so Bedrock/Vertex/Foundry and DISABLE_TELEMETRY users get
 * durable cron. Does NOT consult CLAUDE_CODE_DISABLE_CRON (that kills the whole
 * scheduler via isKairosCronEnabled).
 */
export function isDurableCronEnabled(): boolean {
  return getFeatureValue_CACHED_WITH_REFRESH(
    'tengu_kairos_cron_durable',
    true,
    KAIROS_CRON_REFRESH_MS,
  )
}

export const CRON_CREATE_TOOL_NAME = 'CronCreate'
export const CRON_DELETE_TOOL_NAME = 'CronDelete'
export const CRON_LIST_TOOL_NAME = 'CronList'

export function buildCronCreateDescription(durableEnabled: boolean): string {
  return durableEnabled
    ? 'Schedule a prompt at a future time — recurring on cron or one-shot. Pass durable: true to persist to .claude/scheduled_tasks.json; otherwise session-only.'
    : 'Schedule a prompt at a future time within this Claude session — recurring on cron or one-shot.'
}

export function buildCronCreatePrompt(durableEnabled: boolean): string {
  const durabilitySection = durableEnabled
    ? `## Durability

Default (durable: false): job lives only in this Claude session — nothing to disk, gone on exit. Pass durable: true to write to .claude/scheduled_tasks.json so job survives restarts. Only use durable: true when user explicitly asks for persistence ("keep doing this every day", "set this up permanently"). Most "remind me in 5 minutes" / "check back in an hour" should stay session-only.`
    : `## Session-only

Jobs live only in this Claude session — nothing to disk, gone on exit.`

  const durableRuntimeNote = durableEnabled
    ? 'Durable jobs persist to .claude/scheduled_tasks.json, survive restarts — resume on next launch. Missed one-shot durable tasks surfaced for catch-up. Session-only jobs die with process. '
    : ''

  return `Schedule a prompt at a future time. Use for recurring schedules + one-shot reminders.

Uses standard 5-field cron in local timezone: minute hour day-of-month month day-of-week. "0 9 * * *" = 9am local — no timezone conversion needed.

## One-shot tasks (recurring: false)

For "remind me at X" or "at <time>, do Y" — fire once then auto-delete.
Pin minute/hour/day-of-month/month to specific values:
  "remind me at 2:30pm today to check deploy" → cron: "30 14 <today_dom> <today_month> *", recurring: false
  "tomorrow morning, run smoke test" → cron: "57 8 <tomorrow_dom> <tomorrow_month> *", recurring: false

## Recurring jobs (recurring: true, default)

For "every N minutes" / "every hour" / "weekdays at 9am":
  "*/5 * * * *" (every 5 min), "0 * * * *" (hourly), "0 9 * * 1-5" (weekdays at 9am local)

## Avoid :00 and :30 minute marks when task allows

Every "9am" request gets \`0 9\`, every "hourly" gets \`0 *\` — requests from across planet land on API at same instant. When request approximate, pick minute NOT 0 or 30:
  "every morning around 9" → "57 8 * * *" or "3 9 * * *" (not "0 9 * * *")
  "hourly" → "7 * * * *" (not "0 * * * *")
  "in an hour or so, remind me to..." → pick whatever minute, don't round

Only use minute 0 or 30 when user names exact time and clearly means it ("at 9:00 sharp", "at half past", coordinating with meeting). When in doubt, nudge a few minutes early or late — user won't notice, fleet will.

${durabilitySection}

## Runtime behavior

Jobs only fire while REPL idle (not mid-query). ${durableRuntimeNote}Scheduler adds deterministic jitter: recurring tasks fire up to 10% of period late (max 15 min); one-shot tasks on :00 or :30 fire up to 90 s early. Off-minute is still bigger lever.

Recurring tasks auto-expire after ${DEFAULT_MAX_AGE_DAYS} days — fire one final time, then deleted. Bounds session lifetime. Tell user about ${DEFAULT_MAX_AGE_DAYS}-day limit when scheduling recurring jobs.

Returns job ID for ${CRON_DELETE_TOOL_NAME}.`
}

export const CRON_DELETE_DESCRIPTION = 'Cancel a scheduled cron job by ID'
export function buildCronDeletePrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `Cancel a cron job scheduled with ${CRON_CREATE_TOOL_NAME}. Removes from .claude/scheduled_tasks.json (durable) or in-memory session store (session-only).`
    : `Cancel a cron job scheduled with ${CRON_CREATE_TOOL_NAME}. Removes from in-memory session store.`
}

export const CRON_LIST_DESCRIPTION = 'List scheduled cron jobs'
export function buildCronListPrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `List all cron jobs scheduled via ${CRON_CREATE_TOOL_NAME}, both durable (.claude/scheduled_tasks.json) and session-only.`
    : `List all cron jobs scheduled via ${CRON_CREATE_TOOL_NAME} in this session.`
}
