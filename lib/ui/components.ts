// UI building blocks for the popup and options page.
import { getPath, type Settings } from '../defaults';
import { h } from '../dom';
import { duration } from '../format';
import type { StSummary } from '../types';

export function toggle(checked: boolean, onChange: (v: boolean, input: HTMLInputElement) => void, label?: string): HTMLLabelElement {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, 'aria-label': label ?? '' });
  input.addEventListener('change', () => onChange(input.checked, input));
  return h('label', { class: 'switch' }, input);
}

export function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg', role: 'group' });
  const render = (cur: T) => {
    wrap.replaceChildren(
      ...options.map(([v, label]) =>
        h('button', {
          type: 'button',
          'aria-pressed': String(v === cur),
          onclick: () => {
            render(v);
            onChange(v);
          },
        }, label),
      ),
    );
  };
  render(value);
  return wrap;
}

// --- Friction: changes that loosen focus need a countdown confirmation ---

export function isLoosening(path: string, oldV: unknown, newV: unknown): boolean {
  if (oldV === newV) return false;
  if (path === 'enabled') return oldV === true && newV === false;
  if (path === 'focus.homeMode') return newV === 'normal';
  if (path.startsWith('focus.') && typeof oldV === 'boolean') return oldV && !newV;
  if (path === 'limits.scheduleEnabled' || path === 'limits.friction') return oldV === true && newV === false;
  if (path === 'limits.dailyMinutes') return newV === 0 || (typeof oldV === 'number' && typeof newV === 'number' && oldV > 0 && newV > oldV);
  if (path === 'ads.enabled') return false;
  return false;
}

export function confirmWithCountdown(title: string, body: string, seconds: number): Promise<boolean> {
  if (seconds <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let left = seconds;
    const ok = h('button', { class: 'btn primary', disabled: true }, `Wait ${left}s`);
    const cancel = h('button', { class: 'btn' }, 'Keep focus');
    const back = h('div', { class: 'modal-back' },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, h('h3', null, title), h('p', null, body), h('div', { class: 'actions' }, cancel, ok)),
    );
    const timer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(timer);
        ok.disabled = false;
        ok.textContent = 'Turn it off';
      } else ok.textContent = `Wait ${left}s`;
    }, 1000);
    const done = (v: boolean) => {
      clearInterval(timer);
      back.remove();
      resolve(v);
    };
    ok.addEventListener('click', () => done(true));
    cancel.addEventListener('click', () => done(false));
    document.body.appendChild(back);
    cancel.focus();
  });
}

/** Returns true when the change may go ahead (after a countdown if it loosens focus). */
export async function guard(s: Settings, path: string, value: unknown): Promise<boolean> {
  if (!s.limits.friction || !isLoosening(path, getPath(s, path), value)) return true;
  return confirmWithCountdown('Loosen your focus?', 'Take a breath. If you still want this after the countdown, go ahead.', s.limits.frictionSeconds);
}

// --- Screen time visuals ---

export const faviconUrl = (domain: string) =>
  chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(`https://${domain}`)}&size=32`);

const hourLabel = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric' });
const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short' });

/** Single-series column chart of time per hour (or per day for 7d), with hover tooltips. */
export function timeChart(sum: StSummary, height = 120): HTMLElement {
  const max = Math.max(...sum.series.map((p) => p.ms), 60000);
  const daily = sum.range === '7d';
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const wrap = h('div', { class: 'chart', style: { ['--chart-h' as string]: `${height}px` } as Partial<CSSStyleDeclaration> });
  const bars = h('div', { class: 'chart-bars', role: 'img', 'aria-label': `Time per ${daily ? 'day' : 'hour'}` });
  for (const p of sum.series) {
    const label = daily
      ? `${new Date(p.start).toLocaleDateString([], { weekday: 'long' })} · ${duration(p.ms)}`
      : `${hourLabel(p.start)}–${hourLabel(p.start + 3600000)} · ${duration(p.ms)}`;
    const col = h('div', { tabindex: 0, 'aria-label': label },
      h('span', { style: { height: p.ms ? `${Math.max(2, (p.ms / max) * 100)}%` : '0' } }),
    );
    const show = () => {
      tip.textContent = label;
      tip.hidden = false;
      tip.style.left = `${col.offsetLeft + col.offsetWidth / 2}px`;
      tip.style.top = `${Math.max(0, height - (p.ms / max) * height)}px`;
    };
    col.addEventListener('mouseenter', show);
    col.addEventListener('focus', show);
    col.addEventListener('mouseleave', () => (tip.hidden = true));
    col.addEventListener('blur', () => (tip.hidden = true));
    bars.appendChild(col);
  }
  const first = sum.series[0];
  const mid = sum.series[Math.floor(sum.series.length / 2)];
  const last = sum.series[sum.series.length - 1];
  const fmt = daily ? dayLabel : hourLabel;
  const axis = h('div', { class: 'chart-axis' },
    h('span', null, first ? fmt(first.start) : ''),
    h('span', null, mid && sum.series.length > 2 ? fmt(mid.start) : ''),
    h('span', null, last ? (daily ? 'Today' : 'Now') : ''),
  );
  wrap.append(bars, axis, tip);
  return wrap;
}

export function siteList(sum: StSummary, limit = Infinity): HTMLElement {
  const top = sum.domains[0]?.ms ?? 1;
  const list = h('ul', { class: 'sites' });
  for (const d of sum.domains.slice(0, limit)) {
    const img = h('img', { src: faviconUrl(d.domain), alt: '' });
    list.appendChild(
      h('li', null,
        img,
        h('span', { class: 'name', title: d.domain }, d.domain),
        h('span', { class: 'time' }, duration(d.ms)),
        h('div', { class: 'meter' }, h('span', { style: { width: `${(d.ms / top) * 100}%` } })),
      ),
    );
  }
  if (!sum.domains.length) list.appendChild(h('li', { class: 'muted', style: { display: 'block' } }, 'No browsing time recorded yet.'));
  return list;
}
