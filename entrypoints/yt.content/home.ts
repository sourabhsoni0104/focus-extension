// Replaces YouTube's home feed with either a calm placeholder or a feed of your allowed channels (via RSS).
import type { Settings } from '../../lib/defaults';
import { h, replaceChildren } from '../../lib/dom';
import { compactNumber, duration, relativeTime } from '../../lib/format';
import { allowlistEmpty, keywordMatches } from '../../lib/match';
import { updatePath } from '../../lib/settings';
import { safeSend, type Ctx, type Mod } from './ctx';
import { HOME_PRIMARY } from './selectors';

interface RssVideo {
  id: string;
  title: string;
  author: string;
  published: number;
  views: number;
  short: boolean;
}

const RSS_TTL = 15 * 60 * 1000;
const RSS_CACHE = 'focus_rss';

type HomeView = 'feed' | 'hidden' | 'custom';

function viewFor(s: Settings): HomeView {
  if (!s.enabled) return 'feed';
  const m = s.focus.homeMode;
  if (m === 'hidden') return 'hidden';
  if (m === 'custom') return 'custom';
  if (m === 'allowlist' && allowlistEmpty(s)) return 'hidden';
  return 'feed';
}

async function fetchChannel(id: string): Promise<RssVideo[]> {
  const res = await fetch(`/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`);
  if (!res.ok) return [];
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  return [...xml.getElementsByTagName('entry')].map((e) => {
    const get = (tag: string) => e.getElementsByTagName(tag)[0]?.textContent ?? '';
    const link = e.getElementsByTagName('link')[0]?.getAttribute('href') ?? '';
    return {
      id: get('yt:videoId'),
      title: get('title'),
      author: e.getElementsByTagName('author')[0]?.getElementsByTagName('name')[0]?.textContent ?? '',
      published: Date.parse(get('published')) || 0,
      views: Number(e.getElementsByTagName('media:statistics')[0]?.getAttribute('views') ?? 0),
      short: link.includes('/shorts/'),
    };
  });
}

async function loadFeed(ids: string[]): Promise<RssVideo[]> {
  const key = ids.slice().sort().join(',');
  try {
    const cached = JSON.parse(sessionStorage.getItem(RSS_CACHE) ?? 'null') as { key: string; at: number; items: RssVideo[] } | null;
    if (cached && cached.key === key && Date.now() - cached.at < RSS_TTL) return cached.items;
  } catch {
    /* ignore */
  }
  const lists = await Promise.all(ids.map((id) => fetchChannel(id).catch(() => [])));
  const items = lists.flat().sort((a, b) => b.published - a.published);
  try {
    sessionStorage.setItem(RSS_CACHE, JSON.stringify({ key, at: Date.now(), items }));
  } catch {
    /* quota */
  }
  return items;
}

function container(): HTMLElement | null {
  const existing = document.getElementById('focus-home');
  const primary = document.querySelector(HOME_PRIMARY);
  if (!primary) return null;
  if (existing && primary.contains(existing)) return existing;
  existing?.remove();
  const el = h('div', { id: 'focus-home' });
  primary.prepend(el);
  return el;
}

const openOptions = (hash?: string) => () => void safeSend('ui:openOptions', { hash });

function reasonText(ctx: Ctx): string {
  if (ctx.reason.pomodoro) return 'Pomodoro focus session in progress.';
  if (ctx.reason.schedule) return 'Scheduled focus hours.';
  if (ctx.s.focus.homeMode === 'allowlist') return 'Your allowlist is empty. Add channels, categories or keywords to see them here.';
  return 'Search for what you came for, or check your subscriptions.';
}

async function renderHidden(ctx: Ctx, el: HTMLElement) {
  el.dataset.view = 'hidden';
  const stat = h('div', { class: 'fh-stat' });
  replaceChildren(
    el,
    h(
      'div',
      { class: 'fh-empty' },
      h('h2', null, 'Home feed hidden'),
      h('p', null, reasonText(ctx)),
      h(
        'div',
        { class: 'fh-links' },
        h('a', { href: '/feed/subscriptions' }, 'Subscriptions'),
        h('a', { href: '/playlist?list=WL' }, 'Watch later'),
        h('a', { href: '/feed/history' }, 'History'),
        h('button', { class: 'fh-btn', onclick: openOptions('home') }, 'Edit allowlist'),
      ),
      stat,
    ),
  );
  const ms = await safeSend('st:domainTime', { domain: 'youtube.com', range: 'today' });
  if (ms !== null) stat.textContent = `YouTube today: ${duration(ms)}`;
}

let renderToken = 0;
async function renderCustom(ctx: Ctx, el: HTMLElement) {
  const s = ctx.s;
  el.dataset.view = 'custom';
  const token = ++renderToken;
  const ids = s.allow.channels.map((c) => c.id).filter((x): x is string => !!x);
  const missing = s.allow.channels.length - ids.length;
  if (!ids.length) {
    replaceChildren(
      el,
      h('div', { class: 'fh-empty' },
        h('h2', null, 'Your feed is empty'),
        h('p', null, 'Add channels to your allowlist and their latest uploads will show up here.'),
        h('div', { class: 'fh-links' }, h('button', { class: 'fh-btn', onclick: openOptions('home') }, 'Add channels')),
      ),
    );
    return;
  }
  if (!el.querySelector('.fh-grid')) replaceChildren(el, h('div', { class: 'fh-head' }, h('h2', null, 'Your channels'), h('span', null, 'Loading…')));
  const items = (await loadFeed(ids)).filter(
    (v) => !(s.focus.hideShorts && v.short) && !keywordMatches(s.block.keywords, v.title) && v.id,
  );
  if (token !== renderToken) return;
  replaceChildren(
    el,
    h('div', { class: 'fh-head' },
      h('h2', null, 'Your channels'),
      h('span', null, `${ids.length} channel${ids.length === 1 ? '' : 's'}${missing ? ` · ${missing} without an id (re-add them in settings)` : ''}`),
    ),
    h('div', { class: 'fh-grid' },
      items.slice(0, 60).map((v) =>
        h('a', { class: 'fh-card', href: `/watch?v=${v.id}` },
          h('img', { src: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, loading: 'lazy', alt: '' }),
          h('h3', null, v.title),
          h('p', null, v.author),
          h('p', null, `${v.views ? compactNumber(v.views) + ' views · ' : ''}${relativeTime(v.published)}`),
        ),
      ),
    ),
  );
}

// Allowlist mode filters YouTube's own recommendations, which often contain none of the allowed channels.
// When every card was rejected, say so instead of leaving a blank page.
const HOME_CARDS = 'ytd-browse[page-subtype="home"] ytd-rich-item-renderer';

function allowlistNote(ctx: Ctx) {
  const judged = document.querySelectorAll(`${HOME_CARDS}[data-focus-key]`).length;
  const empty =
    judged > 0 &&
    !document.querySelector(`${HOME_CARDS}[data-focus-ok]`) &&
    !document.querySelector(`${HOME_CARDS}[data-focus-hide="pending"]`);
  const existing = document.getElementById('focus-home');
  if (existing && (!empty || existing.dataset.view !== 'allow-empty')) existing.remove();
  if (!empty) return;
  const el = container();
  const sig = `allow-empty|${ctx.version}`;
  if (!el || el.dataset.sig === sig) return;
  el.dataset.view = 'allow-empty';
  el.dataset.sig = sig;
  const hasChannels = ctx.s.allow.channels.length > 0;
  replaceChildren(
    el,
    h('div', { class: 'fh-empty' },
      h('h2', null, 'Nothing from your allowlist here'),
      h('p', null,
        hasChannels
          ? "YouTube's recommendations don't include any of your allowed channels right now. My channels feed shows their latest uploads directly."
          : "YouTube's recommendations don't match any of your allowed keywords or categories right now.",
      ),
      h('div', { class: 'fh-links' },
        hasChannels
          ? h('button', { class: 'fh-btn', onclick: () => void updatePath('focus.homeMode', 'custom').catch(() => undefined) }, 'Use My channels feed')
          : null,
        h('a', { href: '/feed/subscriptions' }, 'Subscriptions'),
        h('button', { class: 'fh-btn', onclick: openOptions('home') }, 'Edit allowlist'),
      ),
    ),
  );
}

let lastSig = '';
export const home: Mod = {
  navigate(ctx) {
    lastSig = '';
    this.scan!(ctx);
  },
  settings(ctx) {
    lastSig = '';
    this.scan!(ctx);
  },
  scan(ctx) {
    const view = ctx.page === 'home' ? viewFor(ctx.s) : 'feed';
    const root = document.documentElement;
    if (view === 'feed') {
      root.removeAttribute('focus-home-replaced');
      lastSig = '';
      if (ctx.page === 'home' && ctx.s.enabled && ctx.s.focus.homeMode === 'allowlist') allowlistNote(ctx);
      else document.getElementById('focus-home')?.remove();
      return;
    }
    root.setAttribute('focus-home-replaced', '');
    const el = container();
    if (!el) return;
    const sig = `${view}|${ctx.version}|${ctx.reason.pomodoro}|${ctx.reason.schedule}`;
    if (sig === lastSig && el.childElementCount) return;
    lastSig = sig;
    void (view === 'hidden' ? renderHidden(ctx, el) : renderCustom(ctx, el));
  },
};
