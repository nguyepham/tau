import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { isTeammate } from '../../utils/teammate.js'
import { isInProcessTeammate } from '../../utils/teammateContext.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../SendMessageTool/constants.js'
import { AGENT_TOOL_NAME } from './constants.js'
import { isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'

function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0

  if (hasAllowlist && hasDenylist) {
    // Both defined: filter allowlist by denylist to match runtime behavior
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter(t => !denySet.has(t))
    if (effectiveTools.length === 0) {
      return 'None'
    }
    return effectiveTools.join(', ')
  } else if (hasAllowlist) {
    // Allowlist only: show the specific tools available
    return tools.join(', ')
  } else if (hasDenylist) {
    // Denylist only: show "All tools except X, Y, Z"
    return `All tools except ${disallowedTools.join(', ')}`
  }
  // No restrictions
  return 'All tools'
}

/**
 * Format one agent line for the agent_listing_delta attachment message:
 * `- type: whenToUse (Tools: ...)`.
 */
export function formatAgentLine(agent: AgentDefinition): string {
  const toolsDescription = getToolsDescription(agent)
  return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${toolsDescription})`
}

/**
 * Whether the agent list should be injected as an attachment message instead
 * of embedded in the tool description. When true, getPrompt() returns a static
 * description and attachments.ts emits an agent_listing_delta attachment.
 *
 * The dynamic agent list was ~10.2% of fleet cache_creation tokens: MCP async
 * connect, /reload-plugins, or permission-mode changes mutate the list →
 * description changes → full tool-schema cache bust.
 *
 * Override with CLAUDE_CODE_AGENT_LIST_IN_MESSAGES=true/false for testing.
 */
export function shouldInjectAgentListInMessages(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES))
    return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_agent_list_attach', false)
}

export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // Filter agents by allowed types when Agent(x,y) restricts which agents can be spawned
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions

  // Fork subagent feature: when enabled, insert the "When to fork" section
  // (fork semantics, directive-style prompts) and swap in fork-aware examples.
  const forkEnabled = isForkSubagentEnabled()

  const whenToForkSection = forkEnabled
    ? `

## When to fork

Fork yourself (omit \`subagent_type\`) when intermediate tool output isn't worth keeping in context. Criterion qualitative — "will I need this output again" — not task size.
- **Research**: fork open-ended questions. Break into independent questions, launch parallel forks in one message. Fork beats fresh subagent — inherits context + shares cache.
- **Implementation**: prefer fork for work requiring more than a couple edits. Research before jumping to implementation.

Forks cheap — share prompt cache. Don't set \`model\` on fork — different model can't reuse parent's cache. Pass short \`name\` (one/two words, lowercase) so user sees fork in teams panel + can steer mid-run.

**Don't peek.** Tool result includes \`output_file\` path — do not Read or tail unless user explicitly asks progress check. Completion notification arrives; trust it. Reading transcript mid-flight pulls fork's tool noise into context, defeating forking purpose.

**Don't race.** After launch, know nothing about fork findings. Never fabricate or predict fork results — not as prose, summary, or structured output. Notification arrives as user-role message in later turn; never something you write. If user asks follow-up before notification lands, tell them fork still running — give status, not guess.

**Writing fork prompt.** Fork inherits context, so prompt is *directive* — what to do, not what situation is. Be specific about scope: what's in, what's out, what another agent handles. Don't re-explain background.
`
    : ''

  const writingThePromptSection = `

## Writing the prompt

${forkEnabled ? 'Fresh agent (with `subagent_type`) starts with zero context. ' : ''}Brief agent like smart colleague who just walked in — hasn't seen conversation, doesn't know what you've tried, doesn't understand why task matters.
- Explain what + why.
- Describe what you've learned or ruled out.
- Give enough surrounding problem context for judgment calls, not just narrow instruction.
- If need short response, say so ("report in under 200 words").
- Lookups: hand over exact command. Investigations: hand over question — prescribed steps become dead weight when premise wrong.

${forkEnabled ? 'Fresh agents: terse' : 'Terse'} command-style prompts produce shallow, generic work.

**Never delegate understanding.** Don't write "based on findings, fix bug" or "based on research, implement it." Those push synthesis onto agent instead of doing it. Write prompts proving you understood: include file paths, line numbers, what specifically to change.
`

  const forkExamples = `Example usage:

<example>
user: "What's left on this branch before we can ship?"
assistant: <thinking>Forking this \u2014 it's a survey question. I want the punch list, not the git output in my context.</thinking>
${AGENT_TOOL_NAME}({
  name: "ship-audit",
  description: "Branch ship-readiness audit",
  prompt: "Audit what's left before this branch can ship. Check: uncommitted changes, commits ahead of main, whether tests exist, whether the GrowthBook gate is wired up, whether CI-relevant files changed. Report a punch list \u2014 done vs. missing. Under 200 words."
})
assistant: Ship-readiness audit running.
<commentary>
Turn ends here. The coordinator knows nothing about the findings yet. What follows is a SEPARATE turn \u2014 the notification arrives from outside, as a user-role message. It is not something the coordinator writes.
</commentary>
[later turn \u2014 notification arrives as user message]
assistant: Audit's back. Three blockers: no tests for the new prompt path, GrowthBook gate wired but not in build_flags.yaml, and one uncommitted file.
</example>

<example>
user: "so is the gate wired up or not"
<commentary>
User asks mid-wait. The audit fork was launched to answer exactly this, and it hasn't returned. The coordinator does not have this answer. Give status, not a fabricated result.
</commentary>
assistant: Still waiting on the audit \u2014 that's one of the things it's checking. Should land shortly.
</example>

<example>
user: "Can you get a second opinion on whether this migration is safe?"
assistant: <thinking>I'll ask the code-reviewer agent — it won't see my analysis, so it can give an independent read.</thinking>
<commentary>
A subagent_type is specified, so the agent starts fresh. It needs full context in the prompt. The briefing explains what to assess and why.
</commentary>
${AGENT_TOOL_NAME}({
  name: "migration-review",
  description: "Independent migration review",
  subagent_type: "code-reviewer",
  prompt: "Review migration 0042_user_schema.sql for safety. Context: we're adding a NOT NULL column to a 50M-row table. Existing rows get a backfill default. I want a second opinion on whether the backfill approach is safe under concurrent writes — I've checked locking behavior but want independent verification. Report: is this safe, and if not, what specifically breaks?"
})
</example>
`

  const currentExamples = `Example usage:

<example_agent_descriptions>
"test-runner": use this agent after you are done writing code to run tests
"greeting-responder": use this agent to respond to user greetings with a friendly joke
</example_agent_descriptions>

<example>
user: "Please write a function that checks if a number is prime"
assistant: I'm going to use the ${FILE_WRITE_TOOL_NAME} tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a significant piece of code was written and the task was completed, now use the test-runner agent to run the tests
</commentary>
assistant: Uses the ${AGENT_TOOL_NAME} tool to launch the test-runner agent
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the ${AGENT_TOOL_NAME} tool to launch the greeting-responder agent"
</example>
`

  // When the gate is on, the agent list lives in an agent_listing_delta
  // attachment (see attachments.ts) instead of inline here. This keeps the
  // tool description static across MCP/plugin/permission changes so the
  // tools-block prompt cache doesn't bust every time an agent loads.
  const listViaAttachment = shouldInjectAgentListInMessages()

  const agentListSection = listViaAttachment
    ? `Available agent types listed in <system-reminder> messages in conversation.`
    : `Available agent types and the tools they have access to:
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`

  // Shared core prompt used by both coordinator and non-coordinator modes
  const shared = `Launch new agent for complex, multi-step tasks autonomously.

${AGENT_TOOL_NAME} launches specialized agents (subprocesses) that autonomously handle complex tasks. Each agent type has specific capabilities + available tools.

${agentListSection}

${
  forkEnabled
    ? `Specify subagent_type to use specialized agent, or omit to fork yourself — fork inherits full conversation context.`
    : `Specify subagent_type to select agent type. If omitted, general-purpose agent used.`
}`

  // Coordinator mode gets the slim prompt -- the coordinator system prompt
  // already covers usage notes, examples, and when-not-to-use guidance.
  if (isCoordinator) {
    return shared
  }

  // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
  // dedicated Glob/Grep tools, so point at find via Bash instead.
  const embedded = hasEmbeddedSearchTools()
  const fileSearchHint = embedded
    ? '`find` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  // The "class Foo" example is about content search. Non-embedded stays Glob
  // (original intent: find-the-file-containing). Embedded gets grep because
  // find -name doesn't look at file contents.
  const contentSearchHint = embedded
    ? '`grep` via the Bash tool'
    : `the ${GLOB_TOOL_NAME} tool`
  const whenNotToUseSection = forkEnabled
    ? ''
    : `
When NOT to use ${AGENT_TOOL_NAME}:
- Reading specific file path: use ${FILE_READ_TOOL_NAME} or ${fileSearchHint} instead — faster
- Searching class definition like "class Foo": use ${contentSearchHint} instead — faster
- Searching code within specific file or 2-3 files: use ${FILE_READ_TOOL_NAME} instead — faster
- Tasks unrelated to agent descriptions above
`

  // When listing via attachment, the "launch multiple agents" note is in the
  // attachment message (conditioned on subscription there). When inline, keep
  // the existing per-call getSubscriptionType() check.
  const concurrencyNote =
    !listViaAttachment && getSubscriptionType() !== 'pro'
      ? `
- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses`
      : ''

  // Non-coordinator gets the full prompt with all sections
  return `${shared}
${whenNotToUseSection}

Usage notes:
- Always include short description (3-5 words) summarizing what agent will do${concurrencyNote}
- Agent returns single message on completion. Result not visible to user. To show user result, send text message with concise summary.${
    // eslint-disable-next-line custom-rules/no-process-env-top-level
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
    !isInProcessTeammate() &&
    !forkEnabled
      ? `
- Optionally run agents in background with run_in_background param. Auto-notified on completion — do NOT sleep, poll, or proactively check progress. Continue other work or respond to user.
- **Foreground vs background**: Use foreground (default) when need agent's results before proceeding — e.g., research informing next steps. Use background when genuinely independent work to do in parallel.`
      : ''
  }
- Continue previously spawned agent with ${SEND_MESSAGE_TOOL_NAME} using agent's ID or name as \`to\`. Agent resumes with full context preserved. ${forkEnabled ? 'Each fresh Agent with subagent_type starts without context — provide complete task description.' : 'Each Agent starts fresh — provide complete task description.'}
- Agent outputs generally trusted
- Clearly tell agent whether to write code or do research (search, file reads, web fetches, etc.)${forkEnabled ? '' : " — agent not aware of user's intent"}
- If agent description says use proactively, use without user asking. Use judgement.
- If user says run agents "in parallel", MUST send single message with multiple ${AGENT_TOOL_NAME} tool use content blocks.
- Optionally set \`isolation: "worktree"\` to run agent in isolated workspace. Uses Git/hooks when available, filtered snapshot copy otherwise. Workspace auto-cleaned if agent makes no changes; if changes made, workspace path returned in result.${
    process.env.USER_TYPE === 'ant'
      ? `\n- Set \`isolation: "remote"\` to run agent in remote CCR environment. Always background task; notified on completion. Use for long-running tasks needing fresh sandbox.`
      : ''
  }${
    isInProcessTeammate()
      ? `
- run_in_background, name, team_name, mode not available in this context. Only synchronous subagents supported.`
      : isTeammate()
        ? `
- name, team_name, mode not available — teammates cannot spawn other teammates. Omit to spawn subagent.`
        : ''
  }${whenToForkSection}${writingThePromptSection}

${forkEnabled ? forkExamples : currentExamples}`
}
