// Filters video cards (allowlist/blocklist/categories) and applies DeArrow / original titles to them.
import { parseDuration } from '../../lib/format';
import { allowlistEmpty, judge, parseChannelHref, type FeedItem } from '../../lib/match';
import type { Branding, VideoMeta } from '../../lib/types';
import { safeSend, type Ctx, type Mod } from './ctx';
import * as S from './selectors';

const meta = new Map<string, VideoMeta>();
const brandings = new Map<string, Branding | null>();
const wantMeta = new Set<string>();
const wantBrand: string[] = [];
let metaTimer: ReturnType<typeof setTimeout> | undefined;
let brandBusy = 0;

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';

function videoIdOf(href: string | null | undefined): { id?: string; short: boolean } {
  if (!href) return { short: false };
  const short = href.startsWith('/shorts/');
  if (short) return { id: href.split('/')[2]?.split(/[?#]/)[0], short };
  try {
    const u = new URL(href, location.origin);
    return { id: u.searchParams.get('v') ?? undefined, short: false };
  } catch {
    return { short: false };
  }
}

export function extract(el: Element): FeedItem & { titleEl: Element | null } {
  const link = el.querySelector<HTMLAnchorElement>(S.ITEM_LINK);
  const href = link?.getAttribute('href') ?? '';
  const { id, short } = videoIdOf(href);
  const titleEl = el.querySelector(S.ITEM_TITLE);
  const chLink = el.querySelector<HTMLAnchorElement>(S.ITEM_CHANNEL_LINK);
  const ch = parseChannelHref(chLink?.getAttribute('href'));
  const nameEl = el.querySelector(S.ITEM_CHANNEL_NAME);
  let durationSec: number | null = null;
  for (const d of el.querySelectorAll(S.ITEM_DURATION)) {
    durationSec = parseDuration(text(d));
    if (durationSec !== null) break;
  }
  const progress = el.querySelector<HTMLElement>(S.ITEM_PROGRESS);
  const watchedPct = progress ? parseFloat(progress.style.width) || 0 : 0;
  const badgeText = [...el.querySelectorAll('.badge, badge-shape, .yt-badge-shape')].map(text).join(' ');
  return {
    videoId: id,
    title: text(titleEl) || titleEl?.getAttribute('title') || '',
    channelName: text(chLink) || text(nameEl) || undefined,
    channelId: ch.id,
    channelHandle: ch.handle,
    durationSec,
    membersOnly: /members only/i.test(badgeText),
    watchedPct,
    isShort: short || !!el.querySelector('ytm-shorts-lockup-view-model'),
    isMix: /[?&](start_radio=1|list=RD)/.test(href),
    titleEl,
  };
}

/** Outermost cards only (a lockup nested in a rich item is handled once, via the rich item). */
function cards(): Element[] {
  return [...document.querySelectorAll(S.ITEM)].filter((el) => !el.parentElement?.closest(S.ITEM));
}

function requestMeta(ctx: Ctx, id: string) {
  if (meta.has(id) || wantMeta.has(id)) return;
  wantMeta.add(id);
  clearTimeout(metaTimer);
  metaTimer = setTimeout(async () => {
    const ids = [...wantMeta];
    wantMeta.clear();
    const got = await safeSend('yt:videos', { ids });
    for (const id of ids) meta.set(id, got?.[id] ?? { c: '', t: '' });
    ctx.rescan();
  }, 150);
}

function pumpBranding(ctx: Ctx) {
  while (brandBusy < 4 && wantBrand.length) {
    const id = wantBrand.shift()!;
    brandBusy++;
    void safeSend('da:branding', { videoId: id }).then((b) => {
      brandings.set(id, b);
      brandBusy--;
      ctx.rescan();
      pumpBranding(ctx);
    });
  }
}

function requestBranding(ctx: Ctx, id: string) {
  if (brandings.has(id) || wantBrand.includes(id)) return;
  wantBrand.push(id);
  pumpBranding(ctx);
}

// --- title / thumbnail replacement ---
const origTitles = new WeakMap<Element, string>();

export function setTitle(el: Element | null, title: string | undefined) {
  if (!el) return;
  const target = el.querySelector('span.yt-core-attributed-string') ?? el;
  if (!origTitles.has(target)) origTitles.set(target, target.textContent ?? '');
  const want = title ?? origTitles.get(target)!;
  if (target.textContent !== want) target.textContent = want;
}

function setThumb(card: Element, videoId: string, time: number | undefined) {
  const img = card.querySelector<HTMLImageElement>(S.ITEM_THUMB_IMG);
  if (!img) return;
  if (time === undefined) {
    if (img.dataset.focusThumb) {
      delete img.dataset.focusThumb;
      if (img.dataset.focusOrig) img.src = img.dataset.focusOrig;
    }
    return;
  }
  const url = `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${videoId}&time=${time}`;
  if (img.src === url) return;
  if (!img.src.startsWith('https://dearrow-thumb')) img.dataset.focusOrig = img.src;
  img.dataset.focusThumb = '1';
  img.addEventListener('error', () => img.dataset.focusOrig && (img.src = img.dataset.focusOrig), { once: true });
  img.src = url;
}

export function displayTitle(ctx: Ctx, videoId: string): string | undefined {
  const c = ctx.s.community;
  if (c.dearrowTitles) {
    const b = brandings.get(videoId);
    if (b?.title) return b.title;
  }
  if (c.originalTitles && ctx.s.api.youtubeKey) {
    const m = meta.get(videoId);
    if (m?.t) return m.t;
  }
  return undefined;
}

export function requestTitleData(ctx: Ctx, videoId: string) {
  const c = ctx.s.community;
  if (c.dearrowTitles || c.dearrowThumbs) requestBranding(ctx, videoId);
  if (c.originalTitles && ctx.s.api.youtubeKey) requestMeta(ctx, videoId);
}

function decorate(ctx: Ctx, card: Element, item: ReturnType<typeof extract>) {
  const id = item.videoId;
  if (!id || item.isShort) return;
  requestTitleData(ctx, id);
  setTitle(item.titleEl, displayTitle(ctx, id));
  setThumb(card, id, ctx.s.community.dearrowThumbs ? brandings.get(id)?.thumbTime ?? undefined : undefined);
}

export const feedFilter: Mod = {
  scan(ctx) {
    const s = ctx.s;
    if (!s.enabled) {
      document.querySelectorAll('[data-focus-hide]').forEach((el) => el.removeAttribute('data-focus-hide'));
      return;
    }
    const page = ctx.page;
    if (page === 'other') return;
    const homeReplaced = page === 'home' && (s.focus.homeMode === 'hidden' || s.focus.homeMode === 'custom' || (s.focus.homeMode === 'allowlist' && allowlistEmpty(s)));
    if (homeReplaced) return;
    const categoriesEnabled = !!s.api.youtubeKey;
    const needCategories = categoriesEnabled && (s.block.categories.length > 0 || (page === 'home' && s.focus.homeMode === 'allowlist' && s.allow.categories.length > 0));

    for (const card of cards()) {
      const item = extract(card);
      const el = card as HTMLElement;
      const key = `${ctx.version}|${item.videoId ?? item.title}|${item.channelName ?? ''}`;
      const prev = el.dataset.focusKey;
      if (prev === key && el.dataset.focusHide !== 'pending') {
        if (el.dataset.focusHide === undefined) decorate(ctx, card, item);
        continue;
      }
      const category = item.videoId ? meta.get(item.videoId)?.c : undefined;
      let verdict = judge(item, { settings: s, page, category, categoriesEnabled: needCategories });
      if (verdict === 'pending' && item.videoId) requestMeta(ctx, item.videoId);
      if (verdict === 'pending' && !item.videoId) verdict = 'show';
      el.dataset.focusKey = key;
      // data-focus-ok marks approved cards; in allowlist mode the home grid only shows those (see css.ts).
      if (verdict === 'show') {
        el.removeAttribute('data-focus-hide');
        el.dataset.focusOk = '';
        decorate(ctx, card, item);
      } else {
        el.dataset.focusHide = verdict;
        delete el.dataset.focusOk;
      }
    }
  },
};

export function cachedMeta(id: string) {
  return meta.get(id);
}
