// Small DOM helpers that never touch innerHTML (YouTube enforces Trusted Types).

type Attrs = Record<string, string | number | boolean | EventListener | Partial<CSSStyleDeclaration> | undefined | null>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag: string, attrs?: Record<string, string | number>, ...children: SVGElement[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, String(v));
  children.forEach((c) => el.appendChild(c));
  return el;
}

/** An SVG icon from a single 24x24 path. */
export function icon(d: string, size = 24): SVGElement {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor', 'aria-hidden': 'true' }, svg('path', { d }));
}

function applyAttrs(el: HTMLElement, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function appendChildren(el: Node, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replaceChildren(el: Element, ...children: (Child | Child[])[]) {
  clear(el);
  appendChildren(el, children);
}

/** Resolve with the first element matching `sel`, or null after `timeout` ms. */
export function waitFor<T extends Element = Element>(sel: string, timeout = 10000, root: ParentNode = document): Promise<T | null> {
  const found = root.querySelector<T>(sel);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      const el = root.querySelector<T>(sel);
      if (el) {
        obs.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      obs.disconnect();
      resolve(null);
    }, timeout);
  });
}

/** Call fn at most once per `ms`, always running the latest call at the end. */
export function throttle(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  return () => {
    if (timer) return;
    const wait = Math.max(0, last + ms - Date.now());
    timer = setTimeout(() => {
      timer = null;
      last = Date.now();
      fn();
    }, wait);
  };
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Floating message over the player (or page). Optional action button. */
export function toast(text: string, opts: { action?: string; onAction?: () => void; ms?: number } = {}) {
  const host = document.querySelector('#movie_player') ?? document.body;
  if (!host) return;
  let el = document.getElementById('focus-toast');
  if (!el || el.parentElement !== host) {
    el?.remove();
    el = h('div', { id: 'focus-toast' });
    host.appendChild(el);
  }
  replaceChildren(
    el,
    h('span', null, text),
    opts.action
      ? h('button', {
          onclick: ((e: Event) => {
            e.stopPropagation();
            opts.onAction?.();
            el?.classList.remove('show');
          }) as EventListener,
        }, opts.action)
      : null,
  );
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el?.classList.remove('show'), opts.ms ?? 1400);
}
