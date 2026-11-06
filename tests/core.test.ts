import { describe, expect, it } from 'vitest';
import { DEFAULTS, deepMerge, setPath, withDefaults, type Settings } from '../lib/defaults';
import { effectiveSettings, inSchedule } from '../lib/effective';
import { badgeText, hostOf, parseDuration, pomoBadge } from '../lib/format';
import { categoryIdByName } from '../lib/categories';
import { allowlistEmpty, chipFits, judge, keywordMatches, pageOf, parseChannelHref, type FeedItem } from '../lib/match';
import { isLoosening } from '../lib/ui/components';
import { addTime, BUCKET_MS, prune, summarize, sumByDomain, type Buckets } from '../entrypoints/background/screentime-core';
import { advance, initialState, pause, start } from '../entrypoints/background/pomodoro-core';
import { cleanDearrowTitle } from '../entrypoints/background/community';
import { pruneAds } from '../entrypoints/yt-main.content/ads-prune';
import { buildCss } from '../entrypoints/yt.content/css';

const S = (patch: unknown = {}): Settings => deepMerge(structuredClone(DEFAULTS), patch);
const item = (p: Partial<FeedItem> = {}): FeedItem => ({
  videoId: 'abcdefghijk',
  title: 'A video',
  channelName: 'Some Channel',
  durationSec: 600,
  membersOnly: false,
  watchedPct: 0,
  isShort: false,
  isMix: false,
  ...p,
});

describe('format', () => {
  it('formats badge text within 4 chars', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(30_000)).toBe('<1m');
    expect(badgeText(45 * 60000)).toBe('45m');
    expect(badgeText(65 * 60000)).toBe('1:05');
    expect(badgeText(12 * 3600000)).toBe('12h');
  });
  it('parses durations', () => {
    expect(parseDuration('12:34')).toBe(754);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('LIVE')).toBeNull();
    expect(parseDuration(' 0:59 ')).toBe(59);
  });
  it('extracts hosts', () => {
    expect(hostOf('https://www.youtube.com/watch?v=x')).toBe('youtube.com');
    expect(hostOf('chrome://extensions')).toBeNull();
  });
});

describe('pomodoro badge', () => {
  it('shows minutes left, rounded up', () => {
    expect(pomoBadge(25 * 60000)).toBe('25m');
    expect(pomoBadge(24 * 60000 + 1)).toBe('25m');
    expect(pomoBadge(30000)).toBe('1m');
    expect(pomoBadge(0)).toBe('0m');
    expect(pomoBadge(150 * 60000)).toBe('2h');
  });
});

describe('settings helpers', () => {
  it('fills missing keys from defaults', () => {
    const s = withDefaults({ focus: { hideShorts: false } });
    expect(s.focus.hideShorts).toBe(false);
    expect(s.focus.hideSidebarRecs).toBe(DEFAULTS.focus.hideSidebarRecs);
    expect(s.pomodoro.work).toBe(25);
  });
  it('sets nested paths immutably', () => {
    const s = setPath(DEFAULTS, 'player.channelSpeeds.UC123', 2);
    expect(s.player.channelSpeeds.UC123).toBe(2);
    expect(DEFAULTS.player.channelSpeeds.UC123).toBeUndefined();
  });
});

describe('matching', () => {
  it('detects pages', () => {
    expect(pageOf('/')).toBe('home');
    expect(pageOf('/watch')).toBe('watch');
    expect(pageOf('/@mkbhd/videos')).toBe('channel');
    expect(pageOf('/feed/subscriptions')).toBe('subscriptions');
  });
  it('parses channel links', () => {
    expect(parseChannelHref('/@MKBHD')).toEqual({ handle: '@mkbhd' });
    expect(parseChannelHref('/channel/UCBJycsmduvYEL83R_U4JriQ/videos')).toEqual({ id: 'UCBJycsmduvYEL83R_U4JriQ' });
  });
  it('matches keywords and regexes', () => {
    expect(keywordMatches(['react'], 'Learn React in 1 hour')).toBe(true);
    expect(keywordMatches(['/\\bprank(s)?\\b/'], 'Best PRANKS ever')).toBe(true);
    expect(keywordMatches(['/[bad/'], 'anything')).toBe(false);
  });
  it('allowlist mode shows only allowed channels on home', () => {
    const s = S({ focus: { homeMode: 'allowlist' }, allow: { channels: [{ handle: '@good', name: 'Good' }] } });
    const ctx = { settings: s, page: 'home' as const, categoriesEnabled: false };
    expect(judge(item({ channelHandle: '@good' }), ctx)).toBe('show');
    expect(judge(item({ channelName: 'good' }), ctx)).toBe('show');
    expect(judge(item({ channelName: 'Other' }), ctx)).toBe('hide');
    // allowlist does not apply outside home
    expect(judge(item({ channelName: 'Other' }), { ...ctx, page: 'search' })).toBe('show');
  });
  it('waits for categories when category rules are set', () => {
    const s = S({ focus: { homeMode: 'allowlist' }, allow: { categories: ['27'] }, api: { youtubeKey: 'k' } });
    const ctx = { settings: s, page: 'home' as const, categoriesEnabled: true };
    expect(judge(item(), ctx)).toBe('pending');
    expect(judge(item(), { ...ctx, category: '27' })).toBe('show');
    expect(judge(item(), { ...ctx, category: '24' })).toBe('hide');
  });
  it('blocklist applies everywhere except subscriptions/channel pages', () => {
    const s = S({ block: { keywords: ['drama'], minMinutes: 2 } });
    const ctx = { settings: s, page: 'search' as const, categoriesEnabled: false };
    expect(judge(item({ title: 'More DRAMA' }), ctx)).toBe('hide');
    expect(judge(item({ durationSec: 60 }), ctx)).toBe('hide');
    expect(judge(item({ title: 'More drama' }), { ...ctx, page: 'subscriptions' })).toBe('show');
  });
  it('hides shorts and mixes', () => {
    const ctx = { settings: S(), page: 'watch' as const, categoriesEnabled: false };
    expect(judge(item({ isShort: true }), ctx)).toBe('hide');
    expect(judge(item({ isMix: true }), ctx)).toBe('hide');
  });
  it('knows when the allowlist is empty', () => {
    expect(allowlistEmpty(S())).toBe(true);
    expect(allowlistEmpty(S({ allow: { keywords: ['x'] } }))).toBe(false);
    expect(allowlistEmpty(S({ allow: { categories: ['27'] } }))).toBe(false); // works without an API key
  });
  it('allows a home chip that fits the allowlist', () => {
    const s = S({ focus: { homeMode: 'allowlist' }, allow: { categories: ['10'] } });
    expect(chipFits(s, 'Music', [])).toBe(true); // name = allowed category
    expect(chipFits(s, 'Indian pop music', ['10', '10', '10', '10', '24'])).toBe(true); // 80% Music
    expect(chipFits(s, 'Gaming', ['20', '20', '20', '10', '20'])).toBe(false);
    expect(chipFits(s, 'Nusrat Fateh Ali Khan', ['10', '10'])).toBe(false); // too few known yet
    expect(chipFits(S({ allow: { keywords: ['nusrat'] } }), 'Nusrat Fateh Ali Khan', [])).toBe(true);
    const ctx = { settings: s, page: 'home' as const, categoriesEnabled: true, topicAllowed: true };
    expect(judge(item(), ctx)).toBe('show');
    expect(judge(item({ isMix: true }), ctx)).toBe('hide'); // "Hide Mixes" still applies
  });
  it('maps category names to ids', () => {
    expect(categoryIdByName('Music')).toBe('10');
    expect(categoryIdByName(' education ')).toBe('27');
    expect(categoryIdByName('Nope')).toBe('');
    expect(categoryIdByName(undefined)).toBe('');
  });
});

describe('schedule & deep focus', () => {
  const lim = (p: Partial<Settings['limits']>) => ({ ...DEFAULTS.limits, scheduleEnabled: true, ...p });
  it('handles same-day windows', () => {
    const l = lim({ scheduleDays: [1], scheduleStart: '09:00', scheduleEnd: '17:00' });
    expect(inSchedule(l, new Date(2026, 10, 2, 10, 0))).toBe(true); // Monday
    expect(inSchedule(l, new Date(2026, 10, 2, 17, 0))).toBe(false);
    expect(inSchedule(l, new Date(2026, 10, 3, 10, 0))).toBe(false); // Tuesday
  });
  it('handles overnight windows', () => {
    const l = lim({ scheduleDays: [1], scheduleStart: '22:00', scheduleEnd: '02:00' });
    expect(inSchedule(l, new Date(2026, 10, 2, 23, 0))).toBe(true); // Mon 23:00
    expect(inSchedule(l, new Date(2026, 10, 3, 1, 0))).toBe(true); // Tue 01:00 belongs to Monday
    expect(inSchedule(l, new Date(2026, 10, 3, 23, 0))).toBe(false); // Tue night
  });
  it('applies deep focus during a pomodoro work session', () => {
    const s = S({ focus: { hideComments: false, homeMode: 'normal' } });
    const running = { phase: 'work' as const, status: 'running' as const, endsAt: 0, remaining: 0, completed: 0 };
    const eff = effectiveSettings(s, running);
    expect(eff.focus.hideComments).toBe(true);
    expect(eff.focus.homeMode).toBe('hidden');
    expect(effectiveSettings(s, { ...running, phase: 'short' }).focus.hideComments).toBe(false);
  });
});

describe('screen time buckets', () => {
  it('splits time across buckets and sums ranges', () => {
    const b: Buckets = {};
    const t0 = BUCKET_MS * 1000 + BUCKET_MS / 2;
    addTime(b, 'a.com', t0, t0 + BUCKET_MS); // spans two buckets
    expect(Object.keys(b)).toHaveLength(2);
    expect(sumByDomain(b, 0, t0 + 10 * BUCKET_MS)['a.com']).toBeCloseTo(BUCKET_MS);
  });
  it('summarizes the last 24h and drops old data', () => {
    const now = Date.UTC(2026, 10, 5, 12, 0);
    const b: Buckets = {};
    addTime(b, 'youtube.com', now - 3600000, now - 1800000);
    addTime(b, 'github.com', now - 600000, now);
    addTime(b, 'old.com', now - 3 * 86400000, now - 3 * 86400000 + 60000);
    const sum = summarize(b, '24h', now);
    expect(sum.domains.map((d) => d.domain)).toEqual(['youtube.com', 'github.com']);
    expect(sum.total).toBeCloseTo(40 * 60000);
    expect(sum.series.length).toBe(24);
    prune(b, now + 10 * 86400000);
    expect(Object.keys(b)).toHaveLength(0);
  });
});

describe('pomodoro', () => {
  const p = { ...DEFAULTS.pomodoro, longEvery: 2, autoStartBreaks: true, autoStartWork: false };
  it('cycles work -> short -> work -> long', () => {
    let s = start(initialState(p), 0);
    expect(s.endsAt).toBe(25 * 60000);
    s = advance(s, p, 1, true);
    expect([s.phase, s.status, s.completed]).toEqual(['short', 'running', 1]);
    s = advance(s, p, 2, true);
    expect([s.phase, s.status]).toEqual(['work', 'idle']);
    s = advance(start(s, 3), p, 4, true);
    expect([s.phase, s.completed]).toEqual(['long', 2]);
  });
  it('pauses with remaining time and skips without counting', () => {
    const s = pause(start(initialState(p), 0), 60000);
    expect(s.remaining).toBe(24 * 60000);
    const skipped = advance(s, p, 0, false);
    expect([skipped.phase, skipped.completed, skipped.status]).toEqual(['short', 0, 'idle']);
  });
});

describe('ads & misc', () => {
  it('prunes ad keys from player responses', () => {
    const pr = { adPlacements: [1], playerAds: [2], videoDetails: { videoId: 'x' } };
    expect(pruneAds(pr)).toBe(true);
    expect(pr).toEqual({ videoDetails: { videoId: 'x' } });
    const wrapped = [{ playerResponse: { adSlots: [] } }];
    expect(pruneAds(wrapped)).toBe(true);
    expect(pruneAds({ items: [] })).toBe(false);
  });
  it('cleans DeArrow titles', () => {
    expect(cleanDearrowTitle('How >iPhone cameras work')).toBe('How iPhone cameras work');
  });
  it('builds CSS for every option without throwing', () => {
    const css = buildCss(S({ layout: { gridColumns: 4, thumbnails: 'blur' } }));
    expect(css).toContain('ytd-reel-shelf-renderer');
    expect(css).toContain('--ytd-rich-grid-items-per-row: 4');
    expect(buildCss(S({ enabled: false }))).not.toContain('ytd-reel-shelf-renderer');
  });
  it('flags settings changes that loosen focus', () => {
    expect(isLoosening('enabled', true, false)).toBe(true);
    expect(isLoosening('focus.hideShorts', true, false)).toBe(true);
    expect(isLoosening('focus.hideShorts', false, true)).toBe(false);
    expect(isLoosening('focus.homeMode', 'allowlist', 'normal')).toBe(true);
    expect(isLoosening('limits.dailyMinutes', 60, 90)).toBe(true);
    expect(isLoosening('player.defaultSpeed', 1, 2)).toBe(false);
  });
});
