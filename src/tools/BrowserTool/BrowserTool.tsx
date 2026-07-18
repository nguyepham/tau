import type {
  Base64ImageSource,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod/v4'

import { Text } from '../../ink.js'
import {
  buildTool,
  type ToolDef,
  type ToolUseContext,
  type ValidationResult,
} from '../../Tool.js'
import {
  classifyBrowserRisk,
  classifyPressRisk,
  type BrowserRisk,
} from '../../services/browser/riskClassifier.js'
import {
  getBrowserSession,
  SUPPORTED_KEYS,
  type BrowserActionOutcome,
  type TabInfo,
} from '../../services/browser/browserSession.js'
import type { ObservedState } from '../../services/browser/pageScripts.js'
import type { PermissionResult } from '../../types/permissions.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { BROWSER_TOOL_NAME } from './constants.js'

const DESCRIPTION =
  'Drive a real Chrome/Edge browser: navigate, read the rendered page as numbered elements, click, fill, type, scroll, screenshot, and manage tabs. One tool, one action per call.'

const PROMPT = `Operate a real Chromium browser (Chrome, Edge, or Brave) through the DevTools protocol. Unlike WebBrowser/InspectSite (static HTML fetch), this runs JavaScript, so it works on React/Vue/SPA pages, can click and type through real trusted input, and reads the rendered DOM.

THE ONE RULE THAT PREVENTS ERRORS: every call is { "action": "<name>", ...params for that action }. Pick exactly one action. Provide only that action's params. Every action except screenshot returns a fresh page observation, so you continue from the returned state instead of guessing.

THE LOOP:
1. open — launch/attach the browser (once per session). Optionally pass url to land somewhere immediately.
2. observe — get the page as a numbered list of interactive elements (each has a ref @N, its role, and its text). Always observe before acting on a page you have not seen.
3. Act on a ref from the latest observation: click, fill, type, press, scroll. Each returns the new observation.
4. Repeat until done. Refs are only valid for the most recent observation of the current tab; after the DOM changes, use the refs from the observation you just received.

ACTIONS AND THEIR PARAMS:
- open — start the browser. Optional: url (navigate immediately), headless (default false so you and the user see the same window).
- navigate — { url }. http(s) only. Waits for the page to settle, then observes.
- observe — no params. Returns url, title, and interactive elements as "@N tag \\"text\\" [role]".
- click — target the element ONE of three ways, most reliable first:
    { ref: N }            click element @N from the last observation (preferred).
    { text: "Sign in" }   click the best visible element matching that text (optional nth: 2 for the 2nd match).
    { x: 123, y: 456 }    click viewport coordinates (last resort, e.g. canvas/map).
- fill — { ref: N, value: "..." } set an input/textarea/select @N. Reads the value back to confirm it took; reports failure instead of fake success. For <select>, value matches an option by value or visible label.
- type — { text: "..." } type into whatever field currently has focus (click it first). Optional submit: true to press Enter after.
- press — { key: "Enter" } send one key to the page. Supported named keys: ${SUPPORTED_KEYS.join(', ')}. Any single character also works.
- scroll — { direction: "down" } one of up/down/top/bottom. Optional amount (pixels for up/down).
- wait — { ms: 1500 } pause, OR { selector: ".results", timeoutMs: 8000 } wait until a CSS selector appears. Then observes.
- screenshot — no params. Returns a JPEG of the current tab. Use when layout/visual detail matters or text observation is ambiguous; prefer observe for deciding what to click (cheaper and gives you refs).
- tabs — list open tabs with their index, title, and url.
- new_tab — { url } (url optional) open and switch to a new tab.
- switch_tab — { tabIndex: N } make tab N active (indices come from tabs).
- close_tab — { tabIndex: N } close tab N, or the active tab if omitted.
- back — no params. Navigate back in history.
- close — shut the browser down when the task is finished.

RECOVERY (the tool tells you which of these happened via the reason field, so read it and adjust):
- stale_ref — the page changed since your last observe. Call observe and use the new refs.
- element_covered — an overlay/modal is on top of your target. The covering element is named; dismiss it (click its close/accept) or scroll, then retry.
- not_editable — you tried to fill/type a non-input, or a field rejected the text. Click the actual input first, or pick a different element.
- no_match — your text/selector matched nothing (or only a negation). Observe and click by ref.
Cookie/consent banners are auto-dismissed on observe, and CAPTCHA/login walls are flagged in warnings — when you see one, stop and ask the user to handle it in the browser window, then continue.

SAFETY: actions that clearly pay, purchase, delete, or enter card data pause for user confirmation. Do not try to route around that; it is intended.

Prefer this tool over the Computer tool for anything inside a web page — it is DOM-aware and does not burn tokens on screenshots for every step.`

const ACTIONS = [
  'open',
  'navigate',
  'observe',
  'click',
  'fill',
  'type',
  'press',
  'scroll',
  'wait',
  'screenshot',
  'tabs',
  'new_tab',
  'switch_tab',
  'close_tab',
  'back',
  'close',
] as const

const actionSchema = z.enum(ACTIONS)

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: actionSchema.describe(
      'The browser operation to perform. Exactly one per call.',
    ),
    url: z
      .string()
      .optional()
      .describe('URL for open (optional), navigate, and new_tab.'),
    ref: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Element ref @N from the latest observation. For click and fill.',
      ),
    text: z
      .string()
      .optional()
      .describe('For click: visible text to match. For type: text to type.'),
    nth: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('For click by text: which match to click (1-based). Default 1.'),
    value: z.string().optional().describe('For fill: the value to enter.'),
    x: z.number().int().min(0).optional().describe('For click: viewport X coordinate.'),
    y: z.number().int().min(0).optional().describe('For click: viewport Y coordinate.'),
    key: z
      .string()
      .optional()
      .describe('For press: a named key (Enter, Tab, ...) or single character.'),
    submit: z
      .boolean()
      .optional()
      .describe('For type: press Enter after typing. Default false.'),
    direction: z
      .enum(['up', 'down', 'top', 'bottom'])
      .optional()
      .describe('For scroll: the direction.'),
    amount: z
      .number()
      .int()
      .min(1)
      .max(20_000)
      .optional()
      .describe('For scroll up/down: pixels to scroll. Default 650.'),
    ms: z
      .number()
      .int()
      .min(0)
      .max(30_000)
      .optional()
      .describe('For wait: milliseconds to pause.'),
    selector: z
      .string()
      .optional()
      .describe('For wait: CSS selector to wait for.'),
    timeoutMs: z
      .number()
      .int()
      .min(100)
      .max(30_000)
      .optional()
      .describe('For wait by selector: max wait in ms. Default 5000.'),
    tabIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('For switch_tab and close_tab: the tab index from the tabs action.'),
    headless: z
      .boolean()
      .optional()
      .describe('For open: run without a visible window. Default false.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    action: actionSchema,
    ok: z.boolean(),
    message: z.string(),
    reason: z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    elementsText: z.string().optional(),
    tabsText: z.string().optional(),
    warnings: z.array(z.string()),
    screenshot: z
      .object({ base64: z.string(), mediaType: z.enum(['image/jpeg']) })
      .optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type BrowserOutput = z.infer<OutputSchema>

const REQUIRED_BY_ACTION: Partial<Record<Input['action'], Array<keyof Input>>> = {
  navigate: ['url'],
  fill: ['ref', 'value'],
  type: ['text'],
  press: ['key'],
  scroll: ['direction'],
  switch_tab: ['tabIndex'],
}

function validateBrowserInput(input: Input): ValidationResult {
  const required = REQUIRED_BY_ACTION[input.action]
  if (required) {
    const missing = required.filter(field => input[field] === undefined)
    if (missing.length > 0) {
      return {
        result: false,
        message: `Browser action "${input.action}" requires: ${missing.join(', ')}. Call it as { "action": "${input.action}", ${required.map(f => `"${String(f)}": ...`).join(', ')} }.`,
        errorCode: 1,
      }
    }
  }
  if (input.action === 'click') {
    const hasRef = input.ref !== undefined
    const hasText = input.text !== undefined
    const hasCoords = input.x !== undefined && input.y !== undefined
    if (!hasRef && !hasText && !hasCoords) {
      return {
        result: false,
        message:
          'Browser action "click" needs a target: { "ref": N } from the last observation (preferred), or { "text": "..." }, or { "x": .., "y": .. }.',
        errorCode: 1,
      }
    }
  }
  if (input.action === 'wait' && input.ms === undefined && !input.selector) {
    return {
      result: false,
      message:
        'Browser action "wait" needs either { "ms": <milliseconds> } or { "selector": "<css>" }.',
      errorCode: 1,
    }
  }
  return { result: true }
}

/** Renders the observed interactive elements as a compact, ref-addressable list. */
function formatElements(observation: ObservedState): string {
  if (observation.interactive_elements.length === 0) {
    return '(no interactive elements found)'
  }
  const lines = observation.interactive_elements.map(el => {
    const label = el.text || el.aria || el.placeholder || ''
    const parts = [`@${el.id}`, el.tag]
    if (el.role && el.role !== el.tag) parts.push(`[${el.role}]`)
    if (label) parts.push(`"${label}"`)
    if (el.value) parts.push(`= "${el.value}"`)
    if (el.checked !== undefined) parts.push(el.checked ? '(checked)' : '(unchecked)')
    if (el.disabled) parts.push('(disabled)')
    if (el.repeatNote) parts.push(`(+${el.repeatNote} more similar)`)
    return parts.join(' ')
  })
  return lines.join('\n')
}

function formatTabs(tabs: TabInfo[]): string {
  if (tabs.length === 0) return '(no open tabs)'
  return tabs
    .map(
      t =>
        `${t.index}: ${t.active ? '* ' : '  '}${t.title || '(untitled)'} — ${t.url}`,
    )
    .join('\n')
}

function outcomeToOutput(
  action: Input['action'],
  outcome: BrowserActionOutcome,
  extraMessage?: string,
): BrowserOutput {
  const obs = outcome.observation
  const messageParts: string[] = []
  if (extraMessage) messageParts.push(extraMessage)
  if (!outcome.ok && outcome.error) messageParts.push(outcome.error)
  if (obs) {
    messageParts.push(`Now on: ${obs.title || '(untitled)'} — ${obs.url}`)
    if (obs.dismissed) messageParts.push(`(auto-dismissed overlay: ${obs.dismissed})`)
  }
  return {
    action,
    ok: outcome.ok,
    message: messageParts.filter(Boolean).join(' ') || (outcome.ok ? 'Done.' : 'Failed.'),
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(obs ? { url: obs.url, title: obs.title, elementsText: formatElements(obs) } : {}),
    warnings: outcome.warnings,
  }
}

function errorOutput(
  action: Input['action'],
  message: string,
  reason?: string,
): BrowserOutput {
  return {
    action,
    ok: false,
    message,
    ...(reason ? { reason } : {}),
    warnings: [],
  }
}

/**
 * Resolves the human-readable label of the element an action will touch, for
 * the safety brake. Uses the cached observation for ref/coordinate targets.
 */
function riskForInput(input: Input, currentUrl?: string): BrowserRisk | null {
  const session = getBrowserSession()
  if (input.action === 'click') {
    if (input.ref !== undefined) {
      const el = session.getCachedElement(input.ref)
      return classifyBrowserRisk('click', el?.text, el?.placeholder, el?.aria)
    }
    if (input.text !== undefined) {
      return classifyBrowserRisk('click', input.text)
    }
    return null
  }
  if (input.action === 'fill' && input.ref !== undefined) {
    const el = session.getCachedElement(input.ref)
    return classifyBrowserRisk('fill', el?.text, el?.placeholder, el?.aria)
  }
  if (input.action === 'type' && input.submit) {
    return classifyPressRisk('enter', currentUrl)
  }
  if (input.action === 'press' && input.key) {
    return classifyPressRisk(input.key, currentUrl)
  }
  return null
}

function summarize(input: Partial<Input>): string {
  switch (input.action) {
    case 'navigate':
      return `Navigate to ${input.url ?? ''}`
    case 'open':
      return input.url ? `Open browser at ${input.url}` : 'Open browser'
    case 'observe':
      return 'Observe page'
    case 'click':
      if (input.ref !== undefined) return `Click @${input.ref}`
      if (input.text) return `Click "${input.text}"`
      if (input.x !== undefined) return `Click (${input.x}, ${input.y})`
      return 'Click'
    case 'fill':
      return `Fill @${input.ref} = "${(input.value ?? '').slice(0, 30)}"`
    case 'type':
      return `Type "${(input.text ?? '').slice(0, 30)}"`
    case 'press':
      return `Press ${input.key}`
    case 'scroll':
      return `Scroll ${input.direction}`
    case 'wait':
      return input.selector ? `Wait for ${input.selector}` : `Wait ${input.ms ?? ''}ms`
    case 'screenshot':
      return 'Screenshot'
    case 'tabs':
      return 'List tabs'
    case 'new_tab':
      return `New tab${input.url ? ` ${input.url}` : ''}`
    case 'switch_tab':
      return `Switch to tab ${input.tabIndex}`
    case 'close_tab':
      return input.tabIndex !== undefined ? `Close tab ${input.tabIndex}` : 'Close tab'
    case 'back':
      return 'Go back'
    case 'close':
      return 'Close browser'
    default:
      return 'Browser'
  }
}

async function runAction(
  input: Input,
  context: ToolUseContext,
): Promise<BrowserOutput> {
  const session = getBrowserSession()
  const signal = context.abortController.signal

  // Every action except open needs a running browser; start it lazily with a
  // clear message rather than failing, so a stray first call self-heals.
  if (input.action !== 'open' && !session.isRunning()) {
    if (input.action === 'close') {
      return { action: 'close', ok: true, message: 'Browser is already closed.', warnings: [] }
    }
    const started = await session.ensureStarted({ signal })
    if (input.action !== 'navigate' && input.action !== 'tabs') {
      // For a page action with no page yet, surface the auto-start and let the
      // model observe next rather than acting on about:blank.
      const { observation, warnings } = await session.observe(signal)
      return outcomeToOutput(
        input.action,
        { ok: true, observation, warnings },
        `Browser was not open, so I started it (${started.note}). Observe or navigate, then retry your ${input.action}.`,
      )
    }
  }

  switch (input.action) {
    case 'open': {
      const started = await session.ensureStarted({
        signal,
        headless: input.headless,
      })
      if (input.url) {
        await session.navigate(input.url, signal)
      }
      const { observation, warnings } = await session.observe(signal)
      const note =
        started.launched === 'already'
          ? 'Browser already running.'
          : started.note
      return outcomeToOutput(
        'open',
        { ok: true, observation, warnings },
        note,
      )
    }
    case 'navigate': {
      await session.navigate(input.url!, signal)
      const { observation, warnings } = await session.observe(signal)
      return outcomeToOutput('navigate', { ok: true, observation, warnings })
    }
    case 'observe': {
      const { observation, warnings } = await session.observe(signal)
      return outcomeToOutput('observe', { ok: true, observation, warnings })
    }
    case 'click': {
      const outcome = await session.click(
        { ref: input.ref, text: input.text, nth: input.nth, x: input.x, y: input.y },
        signal,
      )
      return outcomeToOutput('click', outcome)
    }
    case 'fill': {
      const outcome = await session.fill(input.ref!, input.value!, signal)
      return outcomeToOutput('fill', outcome)
    }
    case 'type': {
      const outcome = await session.typeText(input.text!, input.submit ?? false, signal)
      return outcomeToOutput('type', outcome)
    }
    case 'press': {
      const outcome = await session.press(input.key!, signal)
      return outcomeToOutput('press', outcome)
    }
    case 'scroll': {
      const outcome = await session.scroll(input.direction!, input.amount, signal)
      return outcomeToOutput('scroll', outcome)
    }
    case 'wait': {
      const outcome = await session.waitAction(
        { ms: input.ms, selector: input.selector, timeoutMs: input.timeoutMs },
        signal,
      )
      return outcomeToOutput('wait', outcome)
    }
    case 'screenshot': {
      const shot = await session.screenshot()
      return {
        action: 'screenshot',
        ok: true,
        message: 'Captured a screenshot of the current tab.',
        warnings: [],
        screenshot: shot,
      }
    }
    case 'tabs': {
      const tabs = await session.listTabs()
      return {
        action: 'tabs',
        ok: true,
        message: `${tabs.length} open tab(s).`,
        tabsText: formatTabs(tabs),
        warnings: [],
      }
    }
    case 'new_tab': {
      await session.newTab(input.url)
      const { observation, warnings } = await session.observe(signal)
      return outcomeToOutput(
        'new_tab',
        { ok: true, observation, warnings },
        'Opened and switched to a new tab.',
      )
    }
    case 'switch_tab': {
      const tabs = await session.selectTab(input.tabIndex!)
      const { observation, warnings } = await session.observe(signal)
      return outcomeToOutput(
        'switch_tab',
        { ok: true, observation, warnings },
        `Switched to tab ${input.tabIndex}.\nOpen tabs:\n${formatTabs(tabs)}`,
      )
    }
    case 'close_tab': {
      const tabs = await session.closeTab(input.tabIndex)
      return {
        action: 'close_tab',
        ok: true,
        message: `Closed tab. ${tabs.length} tab(s) remaining.`,
        tabsText: formatTabs(tabs),
        warnings: [],
      }
    }
    case 'back': {
      await session.goBack(signal)
      const { observation, warnings } = await session.observe(signal)
      return outcomeToOutput('back', { ok: true, observation, warnings })
    }
    case 'close': {
      await session.closeBrowser()
      return { action: 'close', ok: true, message: 'Closed the browser.', warnings: [] }
    }
  }
}

function toTextContent(output: BrowserOutput): string {
  const lines: string[] = []
  lines.push(output.ok ? output.message : `Error: ${output.message}`)
  if (output.reason) lines.push(`Reason: ${output.reason}`)
  if (output.warnings.length > 0) {
    lines.push('', 'Attention:')
    for (const w of output.warnings) lines.push(`- ${w}`)
  }
  if (output.tabsText) {
    lines.push('', 'Tabs:', output.tabsText)
  }
  if (output.elementsText) {
    lines.push('', 'Interactive elements (use @N as ref):', output.elementsText)
  }
  return lines.join('\n')
}

export const BrowserTool = buildTool({
  name: BROWSER_TOOL_NAME,
  searchHint: 'control real chrome browser click type navigate dom automation',
  maxResultSizeChars: 120_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Browser'
  },
  getToolUseSummary(input) {
    return input ? summarize(input) : 'Browser'
  },
  getActivityDescription(input) {
    return input ? summarize(input) : null
  },
  isReadOnly(input) {
    return (
      input.action === 'observe' ||
      input.action === 'screenshot' ||
      input.action === 'tabs' ||
      input.action === 'wait'
    )
  },
  isConcurrencySafe() {
    // A single shared browser session — parallel actions would race on tabs.
    return false
  },
  isDestructive(input) {
    return input.action === 'click' || input.action === 'fill' || input.action === 'type'
  },
  isOpenWorld() {
    return true
  },
  toAutoClassifierInput(input) {
    return {
      action: input.action,
      url: input.url,
      ref: input.ref,
      text: input.text,
      valueLength: input.value?.length,
      key: input.key,
      submit: input.submit,
      direction: input.direction,
    }
  },
  async validateInput(input) {
    return validateBrowserInput(input)
  },
  async checkPermissions(input): Promise<PermissionResult> {
    const risk = riskForInput(input, getBrowserSession().getLastKnownUrl())
    if (risk) {
      return {
        behavior: 'ask',
        message: `This browser action looks like a ${risk.kind} action ("${risk.label}"). Confirm before Tau runs it.`,
      }
    }
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage(input) {
    return <Text>{summarize(input)}</Text>
  },
  renderToolResultMessage(output) {
    if (output.action === 'screenshot' && output.screenshot) {
      return <Text>Captured a screenshot.</Text>
    }
    const head = output.ok ? output.message : `Error: ${output.message}`
    return <Text>{head}</Text>
  },
  extractSearchText(output) {
    return [output.message, output.elementsText, output.tabsText]
      .filter(Boolean)
      .join('\n')
  },
  isResultTruncated(output) {
    return !!output.elementsText || !!output.tabsText
  },
  async call(input, context) {
    try {
      const data = await runAction(input, context)
      return { data }
    } catch (error) {
      if (context.abortController.signal.aborted) {
        return { data: errorOutput(input.action, 'Browser action was interrupted.') }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { data: errorOutput(input.action, message) }
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (output.action === 'screenshot' && output.screenshot) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: output.screenshot
                .mediaType as Base64ImageSource['media_type'],
              data: output.screenshot.base64,
            },
          },
          { type: 'text', text: 'Screenshot of the current tab.' },
        ],
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: toTextContent(output),
      is_error: output.ok ? undefined : true,
    }
  },
} satisfies ToolDef<InputSchema, BrowserOutput>)
