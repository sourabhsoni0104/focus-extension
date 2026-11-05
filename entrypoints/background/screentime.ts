// Tracks time on the active tab of the focused Chrome window.
import { hostOf } from '../../lib/format';
import { loadSettings } from '../../lib/settings';
import type { StRange, StSummary } from '../../lib/types';
import { addTime, prune, rangeBounds, sumByDomain, summarize, type Buckets } from './screentime-core';

const BUCKETS_KEY = 'st_buckets';
const CUR_KEY = 'st_cur'; // in storage.session: survives service-worker restarts, cleared when Chrome restarts
/** Longest stretch credited at once; the 1-minute alarm keeps real gaps far below this. Guards against sleep/suspend. */
const MAX_GAP = 3 * 60 * 1000;

interface Current {
  domain: string | null;
  tabId: number | null;
  since: number;
}

let chain: Promise<unknown> = Promise.resolve();
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn);
  chain = p.catch(() => undefined);
  return p;
}

async function getCurrent(): Promise<Current | null> {
  return ((await chrome.storage.session.get(CUR_KEY))[CUR_KEY] as Current | undefined) ?? null;
}

export async function loadBuckets(): Promise<Buckets> {
  return ((await chrome.storage.local.get(BUCKETS_KEY))[BUCKETS_KEY] as Buckets | undefined) ?? {};
}

/** Credit time since the last flush to the current domain. */
async function flushNow(now: number): Promise<Current | null> {
  const cur = await getCurrent();
  if (!cur) return null;
  if (cur.domain && now > cur.since) {
    const from = Math.max(cur.since, now - MAX_GAP);
    const b = await loadBuckets();
    addTime(b, cur.domain, from, now);
    prune(b, now);
    await chrome.storage.local.set({ [BUCKETS_KEY]: b });
  }
  const next = { ...cur, since: now };
  await chrome.storage.session.set({ [CUR_KEY]: next });
  return next;
}

/** Re-read browser state (focused window, active tab, idle) and switch what we are counting. */
export function refresh(): Promise<void> {
  return queue(async () => {
    const now = Date.now();
    await flushNow(now);
    const s = await loadSettings();
    let domain: string | null = null;
    let tabId: number | null = null;
    if (s.screentime.enabled) {
      const win = await chrome.windows.getLastFocused().catch(() => null);
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tab?.id ?? null;
      if (win?.focused && tab) {
        const idle = await chrome.idle.queryState(Math.max(15, s.screentime.idleMinutes * 60));
        if (idle === 'active' || (s.screentime.countAudible && tab.audible && idle !== 'locked')) domain = hostOf(tab.url);
      }
    }
    await chrome.storage.session.set({ [CUR_KEY]: { domain, tabId, since: now } satisfies Current });
  });
}

export function summary(range: StRange): Promise<StSummary> {
  return queue(async () => {
    const now = Date.now();
    await flushNow(now);
    return summarize(await loadBuckets(), range, now);
  });
}

export function domainTime(domain: string, range: StRange): Promise<number> {
  return queue(async () => {
    const now = Date.now();
    await flushNow(now);
    const { from, to } = rangeBounds(range, now);
    return sumByDomain(await loadBuckets(), from, to)[domain] ?? 0;
  });
}

export function resetData(): Promise<void> {
  return queue(async () => {
    await chrome.storage.local.set({ [BUCKETS_KEY]: {} });
  });
}

export async function setupScreenTime(onChange: () => void) {
  const s = await loadSettings();
  chrome.idle.setDetectionInterval(Math.max(15, s.screentime.idleMinutes * 60));
  const kick = () => refresh().then(onChange, onChange);
  chrome.tabs.onActivated.addListener(kick);
  chrome.tabs.onUpdated.addListener((_id, info, tab) => {
    if (tab.active && (info.url || info.audible !== undefined || info.status === 'complete')) kick();
  });
  chrome.tabs.onRemoved.addListener(kick);
  chrome.windows.onFocusChanged.addListener(kick);
  chrome.idle.onStateChanged.addListener(kick);
  kick();
}

export function setIdleInterval(minutes: number) {
  chrome.idle.setDetectionInterval(Math.max(15, minutes * 60));
}
