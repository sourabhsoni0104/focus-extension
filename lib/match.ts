// Pure feed-filtering logic (unit tested).
import { VIDEO_CATEGORIES } from './categories';
import type { ChannelRef, Settings } from './defaults';

export interface FeedItem {
  videoId?: string;
  title: string;
  channelName?: string;
  channelId?: string;
  channelHandle?: string;
  durationSec: number | null;
  membersOnly: boolean;
  watchedPct: number;
  isShort: boolean;
  isMix: boolean;
}

export type Page = 'home' | 'watch' | 'search' | 'subscriptions' | 'channel' | 'other';
export type Verdict = 'show' | 'hide' | 'pending';

export function pageOf(pathname: string): Page {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname === '/watch') return 'watch';
  if (pathname === '/results') return 'search';
  if (pathname.startsWith('/feed/subscriptions')) return 'subscriptions';
  if (/^\/(@|channel\/|c\/|user\/)/.test(pathname)) return 'channel';
  return 'other';
}

/** "/@Name/videos" -> {handle:"@name"}; "/channel/UCx" -> {id:"UCx"}. */
export function parseChannelHref(href: string | null | undefined): { id?: string; handle?: string } {
  if (!href) return {};
  let path = href;
  try {
    path = new URL(href, 'https://www.youtube.com').pathname;
  } catch {
    /* keep raw */
  }
  const id = path.match(/^\/channel\/(UC[\w-]{22})/)?.[1];
  if (id) return { id };
  const handle = path.match(/^\/(@[^/?#]+)/)?.[1];
  if (handle) return { handle: decodeURIComponent(handle).toLowerCase() };
  return {};
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

export function channelMatches(ref: ChannelRef, ch: { id?: string; handle?: string; name?: string }): boolean {
  if (ref.id && ch.id && ref.id === ch.id) return true;
  if (ref.handle && ch.handle && norm(ref.handle) === norm(ch.handle)) return true;
  if (ref.name && ch.name && norm(ref.name) === norm(ch.name)) return true;
  return false;
}

export const inChannelList = (list: ChannelRef[], ch: { id?: string; handle?: string; name?: string }) =>
  list.some((r) => channelMatches(r, ch));

/** Keywords match case-insensitively as substrings; "/regex/" entries are treated as regular expressions. */
export function keywordMatches(keywords: string[], text: string): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => {
    const kw = k.trim();
    if (!kw) return false;
    const re = kw.match(/^\/(.+)\/([a-z]*)$/);
    if (re) {
      try {
        const flags = re[2] ?? '';
        return new RegExp(re[1] ?? '', flags.includes('i') ? flags : flags + 'i').test(text);
      } catch {
        return false;
      }
    }
    return t.includes(kw.toLowerCase());
  });
}

export interface JudgeContext {
  settings: Settings;
  page: Page;
  /** Category id for a video; undefined = not known yet. */
  category?: string;
  /** Whether this page needs category lookups (category rules are set). */
  categoriesEnabled: boolean;
  /** The selected home chip (topic) fits the allowlist, so everything in it is allowed. */
  topicAllowed?: boolean;
}

/** Below this many videos with a known category, a chip can only fit by its name. */
export const CHIP_MIN_SAMPLE = 5;
/** Share of a chip's videos that must be in allowed categories for the whole chip to be allowed. */
export const CHIP_MIN_SHARE = 0.6;

/**
 * Whether a home-feed chip like "Music" or "Indian pop music" fits the allowlist:
 * its name matches an allowed category, channel or keyword, or most of its videos are in allowed categories.
 */
export function chipFits(s: Settings, chip: string, videoCategories: string[]): boolean {
  const name = norm(chip);
  if (!name) return false;
  const allowedTitles = VIDEO_CATEGORIES.filter((c) => s.allow.categories.includes(c.id)).map((c) => c.title.toLowerCase());
  if (allowedTitles.includes(name)) return true;
  if (keywordMatches(s.allow.keywords, chip) || inChannelList(s.allow.channels, { name: chip })) return true;
  const known = videoCategories.filter(Boolean);
  if (!s.allow.categories.length || known.length < CHIP_MIN_SAMPLE) return false;
  return known.filter((c) => s.allow.categories.includes(c)).length / known.length >= CHIP_MIN_SHARE;
}

export function allowlistEmpty(s: Settings): boolean {
  return !s.allow.channels.length && !s.allow.keywords.length && !s.allow.categories.length;
}

export function judge(item: FeedItem, ctx: JudgeContext): Verdict {
  const { settings: s, page } = ctx;
  const f = s.focus;
  const ch = { id: item.channelId, handle: item.channelHandle, name: item.channelName };
  const text = `${item.title} ${item.channelName ?? ''}`;

  if (f.hideShorts && item.isShort) return 'hide';
  if (f.hideMixes && item.isMix) return 'hide';

  const curated = page === 'subscriptions' || page === 'channel';
  if (!curated) {
    if (inChannelList(s.block.channels, ch)) return 'hide';
    if (keywordMatches(s.block.keywords, text)) return 'hide';
    if (f.hideMembersOnly && item.membersOnly) return 'hide';
    if (item.durationSec !== null) {
      if (s.block.minMinutes > 0 && item.durationSec < s.block.minMinutes * 60) return 'hide';
      if (s.block.maxMinutes > 0 && item.durationSec > s.block.maxMinutes * 60) return 'hide';
    }
    if (ctx.categoriesEnabled && s.block.categories.length) {
      if (ctx.category === undefined) return 'pending';
      if (s.block.categories.includes(ctx.category)) return 'hide';
    }
  }
  if (f.hideWatched && page !== 'channel' && item.watchedPct >= f.watchedThreshold) return 'hide';

  if (page === 'home' && f.homeMode === 'allowlist') {
    if (ctx.topicAllowed) return 'show';
    if (inChannelList(s.allow.channels, ch)) return 'show';
    if (keywordMatches(s.allow.keywords, text)) return 'show';
    if (ctx.categoriesEnabled && s.allow.categories.length) {
      if (ctx.category === undefined) return 'pending';
      if (s.allow.categories.includes(ctx.category)) return 'show';
    }
    return 'hide';
  }
  return 'show';
}
