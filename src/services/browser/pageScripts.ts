/**
 * In-page scripts for the Browser tool, executed via CDP Runtime.evaluate.
 *
 * Adapted from Bah browser (https://github.com/alexvilelabah/bah-browser),
 * MIT License, Copyright (c) Alex Vilela / VilelaLab. The observation,
 * coverage-check, verified-fill, and consent-dismissal techniques are ports
 * of Bah's page-executor.ts and overlay-script.ts, restructured for CDP:
 * observation stores matched elements in `window.__tauRefs` so later actions
 * resolve refs by element identity (stale refs are detected via isConnected)
 * instead of re-enumerating the DOM, which can skew between calls.
 */

export interface InteractiveElement {
  /** Stable ref for this observation. Not renumbered after pruning, so ids may have gaps. */
  id: number
  tag: string
  text: string
  /** Viewport-relative center coordinates in CSS pixels. */
  x: number
  y: number
  w: number
  h: number
  role?: string
  href?: string
  placeholder?: string
  aria?: string
  value?: string
  pressed?: boolean
  checked?: boolean
  disabled?: boolean
  /** Set on a collapsed run marker: N additional similar elements were omitted after this one. */
  repeatNote?: number
}

export interface ObservedState {
  url: string
  title: string
  text_sample: string
  interactive_elements: InteractiveElement[]
  /** Label of the consent/cookie overlay that was auto-dismissed, if any. */
  dismissed?: string
  /** Vertical scroll state, so the model knows whether scrolling can reveal more. */
  scroll?: { y: number; maxY: number; viewportH: number }
}

/** Structured result returned by every in-page action helper. */
export interface PageActionResult {
  success: boolean
  error?: string
  /** Machine-readable failure category: 'stale_ref' | 'element_covered' | 'no_match' | 'not_editable'. */
  reason?: string
  /** Description of the covering element when reason === 'element_covered'. */
  covering?: string
  info?: Record<string, unknown>
}

/** Result of preparing a click target in-page before real input dispatch. */
export interface ClickPrepareResult extends PageActionResult {
  x?: number
  y?: number
  href?: string
  label?: string
  tag?: string
}

/**
 * Wakes lazy loaders and IntersectionObservers before observing, so
 * below-the-fold content that mounts on visibility is present in the DOM.
 */
export const NUDGE_SCRIPT = `
(function(){
  try {
    window.focus();
    document.body && document.body.focus && document.body.focus();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    window.scrollBy(0, 1); window.scrollBy(0, -1);
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('mousemove'));
  } catch(e) {}
  return true;
})()
`

/**
 * Conservative cookie/consent dismisser. Known CMP selectors first (high
 * confidence), then a text heuristic that only fires inside a consent-looking
 * container. Never clicks login/social/reject/settings buttons. Runs once per
 * document (guarded by a window flag). Returns the label of what it clicked,
 * or ''. Top-frame only under CDP (cross-origin CMP iframes are out of reach).
 */
export const OVERLAY_DISMISS_SCRIPT = `
(function(){
  try {
    if (window.__tauOverlaysDismissed) return '';
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.05;
    };
    const fire = (el, why) => {
      try { el.scrollIntoView({ block: 'center' }); } catch(e){}
      try { ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t => el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))); } catch(e){}
      try { if (typeof el.click === 'function') el.click(); } catch(e){}
      window.__tauOverlaysDismissed = true;
      return why;
    };
    const KNOWN = [
      '#onetrust-accept-btn-handler',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#CybotCookiebotDialogBodyButtonAccept',
      '#didomi-notice-agree-button',
      '.qc-cmp2-summary-buttons button[mode="primary"]',
      '.fc-button.fc-cta-consent',
      'button.osano-cm-accept-all',
      '#truste-consent-button',
      'button[data-testid="uc-accept-all-button"]',
      '.sp_choice_type_11',
      'button.sp_choice_type_ACCEPT_ALL',
      'button[title="Accept all" i]','button[title="Accept cookies" i]',
      'button[aria-label="Accept all" i]','button[aria-label="Accept cookies" i]',
    ];
    for (const sel of KNOWN) {
      let el = null; try { el = document.querySelector(sel); } catch(e){}
      if (el && vis(el)) return fire(el, 'consent:' + sel);
    }
    const ACCEPT = /\\b(accept(?:\\s+all)?(?:\\s+cookies)?|i\\s+agree|agree|allow\\s+all|got\\s+it|aceitar(?:\\s+(?:todos|tudo))?|aceito|concordo|entendi|ok)\\b/i;
    const BAD = /\\b(delete|remove|logout|log\\s*out|cancel|unsubscribe|reject|decline|settings|manage|prefer|personaliz|customi[sz]e|with\\s+google|with\\s+facebook|with\\s+apple|with\\s+microsoft|continue\\s+with|sign\\s*in|log\\s*in|sign\\s*up|create\\s+account|excluir|apagar|remover|sair|cancelar|recusar|rejeitar|configurar|gerenciar|fazer\\s+login|criar\\s+conta)\\b/i;
    const CTX = '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[id*="privacy" i],[class*="privacy" i],[id*="cmp" i],[class*="cmp" i],[aria-modal="true"],[role="dialog"]';
    const btns = Array.from(document.querySelectorAll('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], a[href="#"]'));
    for (const b of btns) {
      if (!vis(b)) continue;
      const label = (b.innerText || b.textContent || b.value || b.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim();
      if (!label || label.length > 45) continue;
      if (!ACCEPT.test(label) || BAD.test(label)) continue;
      let inCtx = false; try { inCtx = !!b.closest(CTX); } catch(e){}
      if (!inCtx) continue;
      return fire(b, 'text:' + label.slice(0,45));
    }
    return '';
  } catch(e){ return ''; }
})()
`

/**
 * Observes the page: collects visible interactive elements, stores the raw
 * element references in `window.__tauRefs` (index = ref id), and returns a
 * serializable summary. Actions later resolve refs against that registry, so
 * a ref always means the exact element the model saw, or fails as stale.
 */
export const OBSERVE_SCRIPT = `
(function() {
  const selector = 'a,button,input,textarea,select,[contenteditable="true"],[role=textbox],[role=button],[role=link],[role=checkbox],[role=radio],[role=combobox],[role=option],[role=menuitem],[role=tab],[tabindex]:not([tabindex="-1"])';
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && r.bottom >= 0 && r.right >= 0 && r.top <= innerHeight * 2 && r.left <= innerWidth;
  };
  const all = Array.from(document.querySelectorAll(selector)).filter(isVisible).slice(0, 250);
  window.__tauRefs = all;
  const elements = all.map((el, id) => {
    const r = el.getBoundingClientRect();
    const ariaLabel = el.getAttribute('aria-label') || '';
    const innerText = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const text = (innerText || ariaLabel || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '').slice(0, 120);
    const pressed = el.getAttribute('aria-pressed');
    const checked = el.matches('input[type=checkbox],input[type=radio]') ? String(el.checked) : el.getAttribute('aria-checked');
    const value = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && typeof el.value === 'string' && el.type !== 'password' ? el.value.slice(0, 60) : undefined;
    return {
      id,
      tag: el.tagName.toLowerCase(),
      text,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      w: Math.round(r.width),
      h: Math.round(r.height),
      role: el.getAttribute('role') || undefined,
      href: (el.href && typeof el.href === 'string') ? el.href.slice(0, 300) : undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      aria: ariaLabel ? ariaLabel.slice(0, 80) : undefined,
      value,
      pressed: pressed === 'true' ? true : (pressed === 'false' ? false : undefined),
      checked: checked === 'true' ? true : (checked === 'false' ? false : undefined),
      disabled: (el.disabled === true || el.getAttribute('aria-disabled') === 'true') ? true : undefined,
    };
  });
  const doc = document.documentElement;
  return {
    url: location.href,
    title: document.title,
    text_sample: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 1500),
    interactive_elements: elements,
    scroll: {
      y: Math.round(window.scrollY),
      maxY: Math.max(0, Math.round((doc.scrollHeight || 0) - innerHeight)),
      viewportH: Math.round(innerHeight),
    },
  };
})()
`

/**
 * Idempotent in-page action helpers. Injected before each action call.
 * Click targets are *prepared* here (resolve, scroll into view, coverage
 * check) and then clicked with real CDP input from the Node side;
 * `fallbackClick` is the synthetic-event fallback when real input fails.
 */
export const PAGE_TOOLS_SCRIPT = `
window.__tauPageTools = window.__tauPageTools || {
  visible(el) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0)) return false;
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    if (s.pointerEvents === 'none') return false;
    const opacity = parseFloat(s.opacity);
    if (!Number.isNaN(opacity) && opacity <= 0.01) return false;
    return true;
  },
  label(el) {
    return (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '').replace(/\\s+/g, ' ').trim();
  },
  // Does the element's center point actually hit the element (or a relative)?
  // If not, an overlay/modal is on top and a click would hit the wrong thing.
  coverageCheck(el) {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    if (!hit) return { ok: true };
    if (hit === el || el.contains(hit) || hit.contains(el)) return { ok: true };
    const desc = (hit.tagName || '?').toLowerCase()
      + (hit.id ? '#' + hit.id : '')
      + (hit.getAttribute && hit.getAttribute('aria-label') ? ' [' + hit.getAttribute('aria-label').slice(0, 40) + ']' : '');
    return { ok: false, covering: desc };
  },
  byRef(ref) {
    const list = window.__tauRefs;
    if (!Array.isArray(list)) return { error: 'none_observed' };
    const el = list[Number(ref)];
    if (!el) return { error: 'no_such_ref' };
    if (!el.isConnected) return { error: 'stale' };
    return { el };
  },
  fireClick(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, clientX: x, clientY: y }));
    }
    if (typeof el.click === 'function') el.click();
  },
  prepareEl(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const cov = this.coverageCheck(el);
    if (!cov.ok) return { success: false, reason: 'element_covered', covering: cov.covering, error: 'Target is covered by: ' + cov.covering };
    const r = el.getBoundingClientRect();
    const link = el.closest ? el.closest('a[href]') : null;
    const href = link && link.href && !String(link.href).startsWith('javascript:') ? String(link.href) : undefined;
    return {
      success: true,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      href,
      label: this.label(el).slice(0, 120),
      tag: el.tagName.toLowerCase(),
    };
  },
  prepareRef(ref) {
    const got = this.byRef(ref);
    if (got.error === 'none_observed') return { success: false, reason: 'stale_ref', error: 'No observation registry on this page. Run observe first.' };
    if (got.error === 'no_such_ref') return { success: false, reason: 'stale_ref', error: 'No element with ref @' + ref + ' in the last observation.' };
    if (got.error === 'stale') return { success: false, reason: 'stale_ref', error: 'Element @' + ref + ' is no longer in the page (DOM changed). Re-observe.' };
    return this.prepareEl(got.el);
  },
  prepareText(text, nth) {
    const needle = String(text || '').toLowerCase().trim();
    if (!needle) return { success: false, reason: 'no_match', error: 'Missing text' };
    const NEG = ['no ', 'not ', 'un', 'dis', "don't ", 'do not ', 'never ', 'nao ', 'não '];
    const NEG_SCORE = 900;
    const escapeRe = (s) => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    const wordRe = new RegExp('(^|\\\\W)' + escapeRe(needle) + '($|\\\\W)');
    const score = (label) => {
      const l = label.toLowerCase().trim();
      if (!l.includes(needle)) return 999;
      for (const neg of NEG) { if (l.includes(neg + needle)) return NEG_SCORE; }
      if (l === needle) return 0;
      if (wordRe.test(l)) return 1;
      return 5;
    };
    const selector = 'a,button,[role=button],[role=link],input,textarea,select,[contenteditable="true"],[role=textbox],[tabindex]:not([tabindex="-1"]),span,div,p,li,label';
    const candidates = Array.from(document.querySelectorAll(selector))
      .filter(el => this.visible(el))
      .filter(el => this.label(el).toLowerCase().includes(needle))
      .sort((a, b) => {
        const sa = score(this.label(a));
        const sb = score(this.label(b));
        if (sa !== sb) return sa - sb;
        const ap = a.closest('a,button,[role=button],[role=link]') ? 0 : 1;
        const bp = b.closest('a,button,[role=button],[role=link]') ? 0 : 1;
        return ap - bp || this.label(a).length - this.label(b).length;
      });
    const raw = candidates[Math.max(0, Number(nth || 1) - 1)];
    if (!raw) return { success: false, reason: 'no_match', error: 'No visible element contains text: ' + text };
    if (score(this.label(raw)) >= NEG_SCORE) return { success: false, reason: 'no_match', error: 'Only negated matches found for "' + text + '" (e.g. "' + this.label(raw).slice(0, 60) + '"). Observe and click by ref instead.' };
    const el = raw.closest('a,button,[role=button],[role=link]') || raw;
    return this.prepareEl(el);
  },
  labelAt(x, y) {
    const el = document.elementFromPoint(Number(x), Number(y));
    if (!el) return { found: false };
    return { found: true, label: this.label(el).slice(0, 120), tag: el.tagName.toLowerCase() };
  },
  fallbackClickRef(ref) {
    const got = this.byRef(ref);
    if (!got.el) return { success: false, reason: 'stale_ref', error: 'Ref @' + ref + ' cannot be resolved.' };
    this.fireClick(got.el);
    return { success: true, info: { synthetic: true } };
  },
  fieldValue(el) {
    if (el && typeof el.value === 'string') return el.value;
    if (el && (el.isContentEditable || el.getAttribute('role') === 'textbox')) return el.innerText || el.textContent || '';
    return '';
  },
  editableTarget(el) {
    if (!el) return null;
    if (el.matches && (el.matches('input,textarea,select,[contenteditable="true"],[role=textbox]') || el.isContentEditable)) return el;
    return el.closest && el.closest('input,textarea,select,[contenteditable="true"],[role=textbox]');
  },
  insertText(el, value, replace) {
    if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
      el.focus();
      if (replace) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: value, inputType: replace ? 'insertReplacementText' : 'insertText' }));
      if (!document.execCommand('insertText', false, value)) {
        if (replace) el.textContent = value;
        else el.textContent = (el.textContent || '') + value;
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: replace ? 'insertReplacementText' : 'insertText' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // React/Vue controlled inputs: set through the prototype setter and emit a
    // representative key/input/change sequence so the framework registers it.
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    const keyOpts = { bubbles: true, cancelable: true, key: value.slice(-1) || 'a' };
    el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },
  // Verified fill: reads the real value back afterwards, so a swallowed write
  // (disabled/custom widget) reports failure instead of fake success. Lenient
  // on purpose: masked fields (phone/date) reformat the text and still pass.
  fillRef(ref, value) {
    const got = this.byRef(ref);
    if (got.error === 'none_observed' || got.error === 'no_such_ref') return { success: false, reason: 'stale_ref', error: 'No element with ref @' + ref + ' in the last observation. Re-observe.' };
    if (got.error === 'stale') return { success: false, reason: 'stale_ref', error: 'Element @' + ref + ' is no longer in the page. Re-observe.' };
    const el = this.editableTarget(got.el) || got.el;
    if (el.tagName === 'SELECT') return this.selectOption(el, value, ref);
    if (!this.editableTarget(el)) return { success: false, reason: 'not_editable', error: 'Element @' + ref + ' (' + el.tagName.toLowerCase() + ' "' + this.label(el).slice(0, 40) + '") is not an editable field.' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.focus();
    const want = String(value ?? '');
    this.insertText(el, want, true);
    const gotValue = this.fieldValue(el);
    if (want && !gotValue) return { success: false, reason: 'not_editable', error: 'Field @' + ref + ' stayed empty — it did not accept the text (disabled or custom widget). Try clicking it first, or use a different element.' };
    return { success: true, info: { ref: Number(ref), tag: el.tagName.toLowerCase(), valueLength: gotValue.length, verified: gotValue === want } };
  },
  selectOption(el, value, ref) {
    const want = String(value ?? '').toLowerCase().trim();
    const options = Array.from(el.options || []);
    const match = options.find(o => o.value.toLowerCase() === want)
      || options.find(o => (o.label || o.text || '').toLowerCase().trim() === want)
      || options.find(o => (o.label || o.text || '').toLowerCase().includes(want));
    if (!match) return { success: false, reason: 'no_match', error: 'No option matching "' + value + '" in select @' + ref + '. Options: ' + options.slice(0, 20).map(o => o.label || o.text || o.value).join(' | ').slice(0, 300) };
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
    if (setter) setter.call(el, match.value); else el.value = match.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, info: { ref: Number(ref), tag: 'select', selected: match.label || match.text || match.value } };
  },
  focusedInfo() {
    const el = this.editableTarget(document.activeElement);
    if (!el) return { editable: false };
    return { editable: true, tag: el.tagName.toLowerCase(), label: this.label(el).slice(0, 80), valueBefore: this.fieldValue(el).length };
  },
  verifyTyped() {
    const el = this.editableTarget(document.activeElement);
    if (!el) return { length: 0 };
    return { length: this.fieldValue(el).length };
  },
  scrollPage(direction, amount) {
    const n = Number(amount || 650);
    const doc = document.documentElement;
    const map = { up: -n, down: n, top: -doc.scrollHeight, bottom: doc.scrollHeight };
    window.scrollBy({ top: map[direction] ?? n, behavior: 'instant' });
    return { success: true, info: { direction, y: Math.round(window.scrollY), maxY: Math.max(0, Math.round(doc.scrollHeight - innerHeight)) } };
  },
  async waitFor(selector, timeoutMs) {
    const timeout = Number(timeoutMs || 5000);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (document.querySelector(selector)) return { success: true, info: { selector } }; } catch (e) { return { success: false, error: 'Invalid selector: ' + selector }; }
      await new Promise(r => setTimeout(r, 150));
    }
    return { success: false, error: 'Timed out after ' + timeout + 'ms waiting for selector: ' + selector };
  }
};
`

const TEXT_CAP = 70

function capText(value: string | undefined): string | undefined {
  if (!value) return value
  const t = value.replace(/\s+/g, ' ').trim()
  return t.length > TEXT_CAP ? `${t.slice(0, TEXT_CAP - 1)}…` : t
}

/**
 * Token-economy pruning for huge pages (ported from Bah's "payload razor"):
 * (1) cap per-element text/aria; (2) merge parent/child duplicates that share
 * the same label at the same exact center point; (3) collapse runs of 6+
 * consecutive same-signature elements into 3 representatives, marking the
 * third with repeatNote = how many were omitted. Ref ids are preserved (the
 * in-page registry keeps every element), so pruned output has id gaps.
 */
export function prunePayloadElements(
  elements: InteractiveElement[],
): InteractiveElement[] {
  for (const e of elements) {
    e.text = capText(e.text) ?? ''
    if (e.aria) e.aria = capText(e.aria)
  }

  // Positional parent/child duplicate: same label at the same exact center.
  // Exact position (not a grid) so adjacent, distinct list items never merge.
  const seen = new Set<string>()
  const dedup: InteractiveElement[] = []
  for (const e of elements) {
    const t = (e.text || '').toLowerCase()
    const posKey = `${t}|${e.x}|${e.y}`
    if (t && seen.has(posKey)) continue
    seen.add(posKey)
    dedup.push(e)
  }

  const sig = (e: InteractiveElement) =>
    `${e.tag}|${e.role || ''}|${(e.text || '').toLowerCase()}`
  const out: InteractiveElement[] = []
  for (let i = 0; i < dedup.length; ) {
    let j = i + 1
    while (j < dedup.length && sig(dedup[j]!) === sig(dedup[i]!)) j++
    const run = j - i
    if (run >= 6) {
      out.push(dedup[i]!, dedup[i + 1]!)
      dedup[i + 2]!.repeatNote = run - 3
      out.push(dedup[i + 2]!)
    } else {
      for (let k = i; k < j; k++) out.push(dedup[k]!)
    }
    i = j
  }
  return out
}

/**
 * Detects pages where the agent should stop and ask the user to intervene
 * (CAPTCHA / verification walls, login walls). Ported from Bah's
 * agent-login-policy heuristics, trimmed to the high-confidence signals.
 */
export function detectBlocker(
  observation: ObservedState,
): { kind: 'captcha' | 'login'; hint: string } | null {
  const page = [
    observation.title,
    observation.text_sample,
    observation.interactive_elements
      .map(e => `${e.text || ''} ${e.aria || ''} ${e.placeholder || ''}`)
      .join(' '),
  ]
    .join(' ')
    .toLowerCase()

  const CAPTCHA =
    /\b(captcha|recaptcha|hcaptcha|not\s*a\s*robot|verify\s*you\s*are\s*human|prove\s*you'?re\s*human|verify\s*you'?re\s*human|checking\s*your\s*browser|are\s*you\s*a\s*robot|unusual\s*traffic|security\s*check)\b/i
  if (CAPTCHA.test(page)) {
    return {
      kind: 'captcha',
      hint: 'This page is showing a human-verification challenge. Ask the user to solve it manually in the browser window, then continue.',
    }
  }

  const LOGIN_BLOCK =
    /\b(log\s*in\s*to\s*continue|sign\s*in\s*required|login\s*required|please\s*sign\s*in|you\s*must\s*be\s*logged\s*in|sign\s*in\s*to\s*continue)\b/i
  if (LOGIN_BLOCK.test(page)) {
    return {
      kind: 'login',
      hint: 'This page requires signing in. Do not enter credentials yourself; ask the user to log in manually in the browser window, then continue.',
    }
  }
  return null
}
