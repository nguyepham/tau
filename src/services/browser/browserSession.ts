import type { ChildProcess } from 'child_process'

import { isEnvTruthy } from '../../utils/envUtils.js'
import { CdpClient } from './cdp.js'
import {
  launchBrowser,
  resolveExistingBrowser,
} from './chromeLauncher.js'
import {
  detectBlocker,
  NUDGE_SCRIPT,
  OBSERVE_SCRIPT,
  OVERLAY_DISMISS_SCRIPT,
  PAGE_TOOLS_SCRIPT,
  prunePayloadElements,
  type ClickPrepareResult,
  type InteractiveElement,
  type ObservedState,
  type PageActionResult,
} from './pageScripts.js'

export interface TabInfo {
  index: number
  targetId: string
  url: string
  title: string
  active: boolean
}

export interface BrowserActionOutcome {
  ok: boolean
  error?: string
  /** Machine-readable failure category when ok is false. */
  reason?: string
  /** Action-specific details (navigatedTo, verified, selected, newTab, ...). */
  detail?: Record<string, unknown>
  observation?: ObservedState
  warnings: string[]
}

export interface ClickTarget {
  ref?: number
  text?: string
  nth?: number
  x?: number
  y?: number
}

interface EvaluateResult {
  result?: { type?: string; value?: unknown; description?: string }
  exceptionDetails?: {
    text?: string
    exception?: { description?: string; value?: unknown }
  }
}

interface TargetInfo {
  targetId: string
  type: string
  title: string
  url: string
}

const KEY_MAP: Record<
  string,
  { key: string; code: string; vk: number; text?: string }
> = {
  enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', vk: 9 },
  escape: { key: 'Escape', code: 'Escape', vk: 27 },
  esc: { key: 'Escape', code: 'Escape', vk: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  delete: { key: 'Delete', code: 'Delete', vk: 46 },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  pageup: { key: 'PageUp', code: 'PageUp', vk: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
  home: { key: 'Home', code: 'Home', vk: 36 },
  end: { key: 'End', code: 'End', vk: 35 },
}

export const SUPPORTED_KEYS = Object.keys(KEY_MAP)

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(file|javascript|data|about|chrome):/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function isNavigableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url === 'about:blank'
}

function isRegularPage(target: TargetInfo): boolean {
  return (
    target.type === 'page' &&
    !target.url.startsWith('devtools://') &&
    !target.url.startsWith('chrome-extension://')
  )
}

class BrowserSessionService {
  private client?: CdpClient
  private child?: ChildProcess
  private mode: 'spawned' | 'attached' = 'spawned'
  private sessions = new Map<string, string>()
  private activeTargetId?: string
  private cachedElements = new Map<number, InteractiveElement>()
  private cachedElementsTargetId?: string
  private lastKnownUrl?: string
  private exitHookInstalled = false

  isRunning(): boolean {
    return !!this.client?.isOpen
  }

  getCachedElement(ref: number): InteractiveElement | undefined {
    if (this.cachedElementsTargetId !== this.activeTargetId) return undefined
    return this.cachedElements.get(ref)
  }

  getLastKnownUrl(): string | undefined {
    return this.lastKnownUrl
  }

  async ensureStarted(options: {
    headless?: boolean
    signal?: AbortSignal
  }): Promise<{ launched: 'already' | 'spawned' | 'attached'; note?: string }> {
    if (this.client?.isOpen) return { launched: 'already' }
    this.resetState()

    const connectPort = Number(process.env.TAU_BROWSER_CONNECT_PORT || '')
    if (Number.isInteger(connectPort) && connectPort > 0) {
      const wsUrl = await resolveExistingBrowser(connectPort, options.signal)
      this.client = await CdpClient.connect(wsUrl)
      this.mode = 'attached'
      this.installClientHooks()
      await this.ensureActiveTarget()
      return {
        launched: 'attached',
        note: `Attached to the already-running browser on port ${connectPort} (its real profile and logins).`,
      }
    }

    const headless =
      options.headless ?? isEnvTruthy(process.env.TAU_BROWSER_HEADLESS)
    const launched = await launchBrowser({ headless, signal: options.signal })
    this.child = launched.child
    this.client = await CdpClient.connect(launched.wsUrl)
    this.mode = 'spawned'
    this.installClientHooks()
    this.installExitHook()
    await this.ensureActiveTarget()
    return {
      launched: 'spawned',
      note: `Launched ${launched.executable}${headless ? ' (headless)' : ''} with an isolated automation profile.`,
    }
  }

  async listTabs(): Promise<TabInfo[]> {
    const client = this.requireClient()
    const { targetInfos } = await client.send<{ targetInfos: TargetInfo[] }>(
      'Target.getTargets',
    )
    const pages = targetInfos
      .filter(isRegularPage)
      .sort((a, b) => a.targetId.localeCompare(b.targetId))
    return pages.map((page, index) => ({
      index,
      targetId: page.targetId,
      url: page.url,
      title: page.title,
      active: page.targetId === this.activeTargetId,
    }))
  }

  async selectTab(index: number): Promise<TabInfo[]> {
    const tabs = await this.listTabs()
    const tab = tabs[index]
    if (!tab) {
      throw new Error(
        `No tab with index ${index}. Open tabs: ${tabs.map(t => `${t.index}: ${t.title || t.url}`).join(', ') || 'none'}`,
      )
    }
    this.activeTargetId = tab.targetId
    await this.getActiveSession()
    return this.listTabs()
  }

  async newTab(url?: string): Promise<void> {
    const client = this.requireClient()
    const { targetId } = await client.send<{ targetId: string }>(
      'Target.createTarget',
      { url: 'about:blank' },
    )
    this.activeTargetId = targetId
    await this.getActiveSession()
    if (url) await this.navigate(url)
  }

  async closeTab(index?: number): Promise<TabInfo[]> {
    const client = this.requireClient()
    const tabs = await this.listTabs()
    const tab =
      index === undefined ? tabs.find(t => t.active) : tabs[index]
    if (!tab) {
      throw new Error(
        index === undefined
          ? 'No active tab to close.'
          : `No tab with index ${index}.`,
      )
    }
    await client.send('Target.closeTarget', { targetId: tab.targetId })
    this.sessions.delete(tab.targetId)
    if (this.activeTargetId === tab.targetId) {
      this.activeTargetId = undefined
      await this.ensureActiveTarget()
    }
    return this.listTabs()
  }

  async navigate(url: string, signal?: AbortSignal): Promise<void> {
    const target = normalizeUrl(url)
    if (!isNavigableUrl(target)) {
      throw new Error(
        `The browser agent only navigates to http(s) pages, not "${url}". ` +
          'For local files, serve them over http or use the WebBrowser tool.',
      )
    }
    const client = this.requireClient()
    const sessionId = await this.getActiveSession()
    const loadFired = client.waitForEvent('Page.loadEventFired', sessionId, 15_000)
    const result = await client.send<{ errorText?: string }>(
      'Page.navigate',
      { url: target },
      sessionId,
    )
    if (result.errorText && result.errorText !== 'net::ERR_ABORTED') {
      throw new Error(`Navigation to ${target} failed: ${result.errorText}`)
    }
    await loadFired
    await this.waitForSettle(signal)
    this.lastKnownUrl = target
  }

  async goBack(signal?: AbortSignal): Promise<void> {
    const client = this.requireClient()
    const sessionId = await this.getActiveSession()
    const history = await client.send<{
      currentIndex: number
      entries: Array<{ id: number; url: string }>
    }>('Page.getNavigationHistory', {}, sessionId)
    if (history.currentIndex <= 0) {
      throw new Error('No earlier page in this tab’s history.')
    }
    const entry = history.entries[history.currentIndex - 1]!
    await client.send(
      'Page.navigateToHistoryEntry',
      { entryId: entry.id },
      sessionId,
    )
    await this.waitForSettle(signal)
  }

  async observe(signal?: AbortSignal): Promise<{
    observation: ObservedState
    warnings: string[]
  }> {
    await this.evaluate(NUDGE_SCRIPT).catch(() => undefined)
    const dismissed = await this.evaluate<string>(OVERLAY_DISMISS_SCRIPT).catch(
      () => '',
    )
    if (dismissed) await sleep(350, signal)

    const raw = await this.evaluate<ObservedState>(OBSERVE_SCRIPT)
    if (!raw || !Array.isArray(raw.interactive_elements)) {
      throw new Error('Could not observe the page (no DOM available yet).')
    }
    raw.interactive_elements = prunePayloadElements(raw.interactive_elements)
    if (dismissed) raw.dismissed = dismissed

    this.cachedElements = new Map(
      raw.interactive_elements.map(el => [el.id, el]),
    )
    this.cachedElementsTargetId = this.activeTargetId
    this.lastKnownUrl = raw.url

    const warnings: string[] = []
    const blocker = detectBlocker(raw)
    if (blocker) warnings.push(blocker.hint)
    return { observation: raw, warnings }
  }

  async click(
    target: ClickTarget,
    signal?: AbortSignal,
  ): Promise<BrowserActionOutcome> {
    const warnings: string[] = []
    let prep: ClickPrepareResult

    if (target.x !== undefined && target.y !== undefined) {
      const at = await this.callPageTools<{
        found: boolean
        label?: string
        tag?: string
      }>(`labelAt(${Number(target.x)}, ${Number(target.y)})`)
      prep = {
        success: true,
        x: Number(target.x),
        y: Number(target.y),
        label: at?.label,
        tag: at?.tag,
      }
    } else if (target.ref !== undefined) {
      prep = await this.callPageTools<ClickPrepareResult>(
        `prepareRef(${Number(target.ref)})`,
      )
    } else if (target.text) {
      prep = await this.callPageTools<ClickPrepareResult>(
        `prepareText(${JSON.stringify(target.text)}, ${Number(target.nth ?? 1)})`,
      )
    } else {
      return {
        ok: false,
        reason: 'invalid_target',
        error: 'click needs a ref, a text, or x+y coordinates.',
        warnings,
      }
    }

    if (!prep.success) {
      return {
        ok: false,
        reason: prep.reason,
        error: prep.error ?? 'Could not resolve the click target.',
        warnings,
      }
    }

    const before = await this.pageFingerprint()
    const tabsBefore = await this.listTabs()

    try {
      await this.realClick(prep.x!, prep.y!, signal)
    } catch (error) {
      if (target.ref !== undefined) {
        const fallback = await this.callPageTools<PageActionResult>(
          `fallbackClickRef(${Number(target.ref)})`,
        ).catch(() => null)
        if (!fallback?.success) {
          throw error
        }
        warnings.push(
          'Real input dispatch failed; used a synthetic in-page click instead.',
        )
      } else {
        throw error
      }
    }

    await this.waitForSettle(signal, { maxMs: 5000 })

    // A click can open a new tab; follow it like a user would.
    const tabsAfter = await this.listTabs().catch(() => tabsBefore)
    const known = new Set(tabsBefore.map(t => t.targetId))
    const newTab = tabsAfter.find(t => !known.has(t.targetId))
    if (newTab) {
      this.activeTargetId = newTab.targetId
      await this.getActiveSession()
      await this.waitForSettle(signal, { maxMs: 4000 })
      warnings.push(`The click opened a new tab; switched to it.`)
    }

    const after = await this.pageFingerprint()
    const detail: Record<string, unknown> = {
      clicked: prep.label || prep.tag || 'element',
      ...(newTab ? { newTab: true } : {}),
    }

    // Link that visibly did nothing: fall back to direct navigation, which is
    // more reliable than fighting an interception layer (ported from Bah).
    if (
      !newTab &&
      prep.href &&
      before &&
      after &&
      before.url === after.url &&
      before.elementCount === after.elementCount
    ) {
      await this.navigate(prep.href, signal)
      detail.navigatedTo = prep.href
      warnings.push(
        'The click had no visible effect; navigated directly to the link target instead.',
      )
    }

    const { observation, warnings: observeWarnings } = await this.observe(signal)
    warnings.push(...observeWarnings)
    return { ok: true, detail, observation, warnings }
  }

  async fill(
    ref: number,
    value: string,
    signal?: AbortSignal,
  ): Promise<BrowserActionOutcome> {
    const result = await this.callPageTools<PageActionResult>(
      `fillRef(${Number(ref)}, ${JSON.stringify(value)})`,
    )
    if (!result.success) {
      return {
        ok: false,
        reason: result.reason,
        error: result.error ?? 'Fill failed.',
        warnings: [],
      }
    }
    await this.waitForSettle(signal, { maxMs: 1500 })
    const { observation, warnings } = await this.observe(signal)
    return { ok: true, detail: { ...result.info }, observation, warnings }
  }

  async typeText(
    text: string,
    submit: boolean,
    signal?: AbortSignal,
  ): Promise<BrowserActionOutcome> {
    const focused = await this.callPageTools<{
      editable: boolean
      tag?: string
      label?: string
    }>('focusedInfo()')
    if (!focused?.editable) {
      return {
        ok: false,
        reason: 'not_editable',
        error:
          'No editable field has focus. Click the field first (click with its ref), then type.',
        warnings: [],
      }
    }
    const client = this.requireClient()
    const sessionId = await this.getActiveSession()
    await client.send('Input.insertText', { text }, sessionId)
    const typed = await this.callPageTools<{ length: number }>('verifyTyped()')
    if (text && (!typed || typed.length === 0)) {
      return {
        ok: false,
        reason: 'not_editable',
        error:
          'The focused field did not accept the text (still empty). Click the right field before typing, or use fill with the field’s ref.',
        warnings: [],
      }
    }
    if (submit) await this.dispatchKey('enter')
    await this.waitForSettle(signal, { maxMs: submit ? 5000 : 1500 })
    const { observation, warnings } = await this.observe(signal)
    return {
      ok: true,
      detail: {
        typedInto: focused.label || focused.tag,
        length: text.length,
        submitted: submit,
      },
      observation,
      warnings,
    }
  }

  async press(key: string, signal?: AbortSignal): Promise<BrowserActionOutcome> {
    const normalized = key.trim().toLowerCase()
    if (KEY_MAP[normalized]) {
      await this.dispatchKey(normalized)
    } else if (key.length === 1) {
      const client = this.requireClient()
      const sessionId = await this.getActiveSession()
      await client.send('Input.insertText', { text: key }, sessionId)
    } else {
      return {
        ok: false,
        reason: 'invalid_target',
        error: `Unsupported key "${key}". Supported: ${SUPPORTED_KEYS.join(', ')}, or any single character.`,
        warnings: [],
      }
    }
    await this.waitForSettle(signal, { maxMs: 4000 })
    const { observation, warnings } = await this.observe(signal)
    return { ok: true, detail: { key: normalized }, observation, warnings }
  }

  async scroll(
    direction: 'up' | 'down' | 'top' | 'bottom',
    amount: number | undefined,
    signal?: AbortSignal,
  ): Promise<BrowserActionOutcome> {
    const result = await this.callPageTools<PageActionResult>(
      `scrollPage(${JSON.stringify(direction)}, ${amount ? Number(amount) : 'undefined'})`,
    )
    await this.waitForSettle(signal, { maxMs: 1200 })
    const { observation, warnings } = await this.observe(signal)
    return { ok: true, detail: { ...result.info }, observation, warnings }
  }

  async waitAction(
    options: { ms?: number; selector?: string; timeoutMs?: number },
    signal?: AbortSignal,
  ): Promise<BrowserActionOutcome> {
    if (options.selector) {
      const timeout = Math.min(options.timeoutMs ?? 5000, 30_000)
      const result = await this.callPageTools<PageActionResult>(
        `waitFor(${JSON.stringify(options.selector)}, ${timeout})`,
        { awaitPromise: true, timeoutMs: timeout + 5000 },
      )
      if (!result.success) {
        return {
          ok: false,
          reason: 'timeout',
          error: result.error ?? 'Wait timed out.',
          warnings: [],
        }
      }
    } else {
      await sleep(Math.min(options.ms ?? 1000, 30_000), signal)
    }
    const { observation, warnings } = await this.observe(signal)
    return { ok: true, observation, warnings }
  }

  async screenshot(): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
    const client = this.requireClient()
    const sessionId = await this.getActiveSession()
    const { data } = await client.send<{ data: string }>(
      'Page.captureScreenshot',
      { format: 'jpeg', quality: 60 },
      sessionId,
      20_000,
    )
    return { base64: data, mediaType: 'image/jpeg' }
  }

  async closeBrowser(): Promise<void> {
    const client = this.client
    if (client?.isOpen) {
      if (this.mode === 'spawned') {
        await client.send('Browser.close', {}, undefined, 5_000).catch(() => {
          this.child?.kill()
        })
      }
      client.close()
    }
    if (this.mode === 'spawned') {
      const child = this.child
      if (child && child.exitCode === null) {
        setTimeout(() => {
          if (child.exitCode === null) child.kill()
        }, 3_000).unref()
      }
    }
    this.resetState()
  }

  /**
   * Waits for the DOM to stop growing instead of sleeping a fixed time
   * (ported from Bah): returns as soon as the element count is stable for
   * `quietMs` with readyState complete, capped at `maxMs`. Each probe is
   * raced against 1.5s so a page with a wedged main thread cannot hang us.
   */
  private async waitForSettle(
    signal?: AbortSignal,
    options?: { maxMs?: number; quietMs?: number },
  ): Promise<void> {
    const maxMs = options?.maxMs ?? 4000
    const quietMs = options?.quietMs ?? 350
    const start = Date.now()
    let lastCount = -1
    let stableSince = 0
    while (Date.now() - start < maxMs) {
      if (signal?.aborted) return
      const snap = await Promise.race([
        this.evaluate<{ rs: string; n: number }>(
          `({ rs: document.readyState, n: document.getElementsByTagName('*').length })`,
        ).catch(() => null),
        sleep(1500).then(() => null),
      ])
      if (!snap) return
      if (snap.n === lastCount) {
        if (!stableSince) stableSince = Date.now()
        if (snap.rs === 'complete' && Date.now() - stableSince >= quietMs) return
      } else {
        lastCount = snap.n
        stableSince = 0
      }
      await sleep(120, signal).catch(() => undefined)
    }
  }

  /**
   * Trusted click through CDP input dispatch: short eased mouse path with
   * jitter, then press/release. Sites see the same event stream a human
   * produces (isTrusted true), so React/Vue/anti-bot handlers respond.
   */
  private async realClick(
    x: number,
    y: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const client = this.requireClient()
    const sessionId = await this.getActiveSession()
    const tx = Math.round(x + rnd(-2, 2))
    const ty = Math.round(y + rnd(-2, 2))
    const sx = Math.max(0, Math.round(tx - rnd(40, 90)))
    const sy = Math.max(0, Math.round(ty - rnd(25, 60)))
    const steps = 4 + Math.floor(rnd(0, 3))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = t * t * (3 - 2 * t)
      await client.send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseMoved',
          x: Math.round(sx + (tx - sx) * e),
          y: Math.round(sy + (ty - sy) * e),
        },
        sessionId,
      )
      await sleep(rnd(8, 22), signal)
    }
    await client.send(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: tx, y: ty, button: 'left', clickCount: 1, buttons: 1 },
      sessionId,
    )
    await sleep(rnd(60, 130), signal)
    await client.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: tx, y: ty, button: 'left', clickCount: 1, buttons: 0 },
      sessionId,
    )
  }

  private async dispatchKey(normalizedKey: string): Promise<void> {
    const entry = KEY_MAP[normalizedKey]!
    const client = this.requireClient()
    const sessionId = await this.getActiveSession()
    const base = {
      key: entry.key,
      code: entry.code,
      windowsVirtualKeyCode: entry.vk,
      nativeVirtualKeyCode: entry.vk,
    }
    await client.send(
      'Input.dispatchKeyEvent',
      { type: entry.text ? 'keyDown' : 'rawKeyDown', ...base, ...(entry.text ? { text: entry.text } : {}) },
      sessionId,
    )
    await client.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', ...base },
      sessionId,
    )
  }

  private async pageFingerprint(): Promise<{
    url: string
    elementCount: number
  } | null> {
    return this.evaluate<{ url: string; elementCount: number }>(
      `({ url: location.href, elementCount: document.getElementsByTagName('*').length })`,
    ).catch(() => null)
  }

  private async callPageTools<T>(
    invocation: string,
    options?: { awaitPromise?: boolean; timeoutMs?: number },
  ): Promise<T> {
    return this.evaluate<T>(
      `${PAGE_TOOLS_SCRIPT}\n window.__tauPageTools.${invocation}`,
      options,
    )
  }

  private async evaluate<T>(
    expression: string,
    options?: { awaitPromise?: boolean; timeoutMs?: number },
  ): Promise<T> {
    const client = this.requireClient()
    const sessionId = await this.getActiveSession()
    const evaluated = await client.send<EvaluateResult>(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: options?.awaitPromise ?? false,
        userGesture: true,
      },
      sessionId,
      options?.timeoutMs ?? 30_000,
    )
    if (evaluated.exceptionDetails) {
      const description =
        evaluated.exceptionDetails.exception?.description ??
        evaluated.exceptionDetails.text ??
        'Page script failed'
      throw new Error(description.split('\n')[0])
    }
    return evaluated.result?.value as T
  }

  private requireClient(): CdpClient {
    if (!this.client?.isOpen) {
      throw new Error(
        'The browser is not running. Use the open action to start it.',
      )
    }
    return this.client
  }

  private async ensureActiveTarget(): Promise<void> {
    const client = this.requireClient()
    const { targetInfos } = await client.send<{ targetInfos: TargetInfo[] }>(
      'Target.getTargets',
    )
    const pages = targetInfos
      .filter(isRegularPage)
      .sort((a, b) => a.targetId.localeCompare(b.targetId))
    const current = pages.find(p => p.targetId === this.activeTargetId)
    if (current) return
    if (pages.length > 0) {
      this.activeTargetId = pages[0]!.targetId
    } else {
      const { targetId } = await client.send<{ targetId: string }>(
        'Target.createTarget',
        { url: 'about:blank' },
      )
      this.activeTargetId = targetId
    }
    await this.getActiveSession()
  }

  private async getActiveSession(): Promise<string> {
    const client = this.requireClient()
    if (!this.activeTargetId) {
      await this.ensureActiveTarget()
    }
    const targetId = this.activeTargetId!
    const cached = this.sessions.get(targetId)
    if (cached) return cached
    const { sessionId } = await client.send<{ sessionId: string }>(
      'Target.attachToTarget',
      { targetId, flatten: true },
    )
    this.sessions.set(targetId, sessionId)
    await client.send('Page.enable', {}, sessionId).catch(() => undefined)
    await client.send('Runtime.enable', {}, sessionId).catch(() => undefined)
    return sessionId
  }

  private installClientHooks(): void {
    const client = this.client
    if (!client) return
    client.on('Target.detachedFromTarget', (params: { sessionId?: string }) => {
      for (const [targetId, sessionId] of this.sessions) {
        if (sessionId === params.sessionId) this.sessions.delete(targetId)
      }
    })
    client.onClose(() => {
      if (this.client === client) this.resetState()
    })
  }

  private installExitHook(): void {
    if (this.exitHookInstalled) return
    this.exitHookInstalled = true
    process.once('exit', () => {
      if (
        this.mode === 'spawned' &&
        this.child &&
        this.child.exitCode === null &&
        !isEnvTruthy(process.env.TAU_BROWSER_KEEP_OPEN)
      ) {
        try {
          this.child.kill()
        } catch {
          // Best-effort cleanup.
        }
      }
    })
  }

  private resetState(): void {
    this.client = undefined
    this.child = undefined
    this.sessions.clear()
    this.activeTargetId = undefined
    this.cachedElements.clear()
    this.cachedElementsTargetId = undefined
  }
}

let singleton: BrowserSessionService | undefined

export function getBrowserSession(): BrowserSessionService {
  if (!singleton) singleton = new BrowserSessionService()
  return singleton
}

export type { BrowserSessionService }
