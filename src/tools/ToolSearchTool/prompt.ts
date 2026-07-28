import { feature } from 'bun:bundle'
import { isReplBridgeActive } from '../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import type { Tool } from '../../Tool.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { getPowerModeFromSettings } from '../../utils/powerMode.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { shouldDisableToolDeferralForProvider } from '../../utils/toolDeferralPolicy.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'

// Dead code elimination: Brief tool name only needed when KAIROS or KAIROS_BRIEF is on
/* eslint-disable @typescript-eslint/no-require-imports */
const BRIEF_TOOL_NAME: string | null =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? (
        require('../BriefTool/prompt.js') as typeof import('../BriefTool/prompt.js')
      ).BRIEF_TOOL_NAME
    : null
const SEND_USER_FILE_TOOL_NAME: string | null = feature('KAIROS')
  ? (
      require('../SendUserFileTool/prompt.js') as typeof import('../SendUserFileTool/prompt.js')
    ).SEND_USER_FILE_TOOL_NAME
  : null

/* eslint-enable @typescript-eslint/no-require-imports */

export { TOOL_SEARCH_TOOL_NAME } from './constants.js'

import { TOOL_SEARCH_TOOL_NAME } from './constants.js'

const PROMPT_HEAD = `Fetches JSONSchema for deferred tools. `

function getToolLocationHint(): string {
  const deltaEnabled =
    process.env.USER_TYPE === 'ant' ||
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_glacier_2xr', false)
  return deltaEnabled
    ? 'Deferred tools appear in <system-reminder>.'
    : 'Deferred tools appear in <available-deferred-tools>.'
}

const PROMPT_TAIL = ` Fetch schema to call deferred tools. Returns schema in <functions> block.

Query syntax:
- \`select:ToolA,ToolB\`: exact match
- \`keyword search\`: fuzzy match
- \`+required keyword\`: required match`

/**
 * Check if a tool should be deferred (requires ToolSearch to load).
 * A tool is deferred if:
 * - It's an MCP tool (always deferred - workflow-specific)
 * - It has shouldDefer: true
 *
 * A tool is NEVER deferred if it has alwaysLoad: true (MCP tools set this via
 * _meta['anthropic/alwaysLoad']). This check runs first, before any other rule.
 */
export function isDeferredTool(tool: Tool): boolean {
  // Power-mode gate — nothing is deferred in these cases. On the native
  // (non-Anthropic) lanes a deferred tool is physically dropped from the
  // request and reaches the model as a name-only stub, so the model calls it
  // blind (TaskCreate, WebFetch, NotebookEdit, …) and the call fails schema
  // validation before it can recover. Sending every schema upfront makes tool
  // calling behave identically on every provider with zero first-call
  // failures, and with zero deferred tools ToolSearch drops out of the request
  // automatically (claude.ts / native lazy paths both guard on "no deferred
  // tools").
  //
  //   - cheap: never defer, on any provider. The cheap tool set is a small
  //     fixed allowlist so deferral saves almost nothing, and MCP tools are
  //     already excluded from the pool, so this can't pull MCP into the prompt.
  //   - normal (the default): never defer on a native lane — the schema-fail
  //     non-Anthropic lanes; Bedrock/Vertex/Foundry keep their existing
  //     server-side deferral behavior.
  //   - full (retired/hidden): unchanged — defers as before.
  // Policy override: first-party Anthropic keeps schemas inline to avoid
  // direct calls with hidden/remembered parameter shapes.
  const powerMode = getPowerModeFromSettings(getInitialSettings())
  if (shouldDisableToolDeferralForProvider(getAPIProvider(), powerMode)) {
    return false
  }

  // Explicit opt-out via _meta['anthropic/alwaysLoad'] — tool appears in the
  // initial prompt with full schema. Checked first so MCP tools can opt out.
  if (tool.alwaysLoad === true) return false

  // MCP tools are always deferred (workflow-specific)
  if (tool.isMcp === true) return true

  // Never defer ToolSearch itself — the model needs it to load everything else
  if (tool.name === TOOL_SEARCH_TOOL_NAME) return false

  // Fork-first experiment: Agent must be available turn 1, not behind ToolSearch.
  // Lazy require: static import of forkSubagent → coordinatorMode creates a cycle
  // through constants/tools.ts at module init.
  if (feature('FORK_SUBAGENT') && tool.name === AGENT_TOOL_NAME) {
    type ForkMod = typeof import('../AgentTool/forkSubagent.js')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('../AgentTool/forkSubagent.js') as ForkMod
    if (m.isForkSubagentEnabled()) return false
  }

  // Brief is the primary communication channel whenever the tool is present.
  // Its prompt contains the text-visibility contract, which the model must
  // see without a ToolSearch round-trip. No runtime gate needed here: this
  // tool's isEnabled() IS isBriefEnabled(), so being asked about its deferral
  // status implies the gate already passed.
  if (
    (feature('KAIROS') || feature('KAIROS_BRIEF')) &&
    BRIEF_TOOL_NAME &&
    tool.name === BRIEF_TOOL_NAME
  ) {
    return false
  }

  // SendUserFile is a file-delivery communication channel (sibling of Brief).
  // Must be immediately available without a ToolSearch round-trip.
  if (
    feature('KAIROS') &&
    SEND_USER_FILE_TOOL_NAME &&
    tool.name === SEND_USER_FILE_TOOL_NAME &&
    isReplBridgeActive()
  ) {
    return false
  }

  return tool.shouldDefer === true
}

/**
 * Format one deferred-tool line for the <available-deferred-tools> user
 * message. Search hints (tool.searchHint) are not rendered — the
 * hints A/B (exp_xenhnnmn0smrx4, stopped Mar 21) showed no benefit.
 */
export function formatDeferredToolLine(tool: Tool): string {
  return tool.name
}

export function getPrompt(): string {
  return PROMPT_HEAD + getToolLocationHint() + PROMPT_TAIL
}
