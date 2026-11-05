// Pure screen-time bucket math (unit tested).
import type { StRange, StSummary } from '../../lib/types';

export const BUCKET_MS = 10 * 60 * 1000;
export const KEEP_MS = 8 * 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** bucketStart (ms, as string key) -> domain -> ms */
export type Buckets = Record<string, Record<string, number>>;

/** Add the interval [from, to) for `domain`, split across 10-minute buckets. Mutates `b`. */
export function addTime(b: Buckets, domain: string, from: number, to: number): Buckets {
  let t = from;
  while (t < to) {
    const start = Math.floor(t / BUCKET_MS) * BUCKET_MS;
    const end = Math.min(to, start + BUCKET_MS);
    const slot = (b[start] ??= {});
    slot[domain] = (slot[domain] ?? 0) + (end - t);
    t = end;
  }
  return b;
}

export function prune(b: Buckets, now: number): Buckets {
  for (const k of Object.keys(b)) if (Number(k) + BUCKET_MS < now - KEEP_MS) delete b[k];
  return b;
}

/** Fraction of bucket [start, start+BUCKET) that overlaps [from, to). Assumes time is spread evenly inside a bucket. */
function overlap(start: number, from: number, to: number): number {
  const a = Math.max(start, from);
  const z = Math.min(start + BUCKET_MS, to);
  return z > a ? (z - a) / BUCKET_MS : 0;
}

export function sumByDomain(b: Buckets, from: number, to: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, slot] of Object.entries(b)) {
    const f = overlap(Number(k), from, to);
    if (!f) continue;
    for (const [d, ms] of Object.entries(slot)) out[d] = (out[d] ?? 0) + ms * f;
  }
  return out;
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function rangeBounds(range: StRange, now: number): { from: number; to: number } {
  if (range === '24h') return { from: now - DAY, to: now };
  if (range === 'today') return { from: startOfDay(now), to: now };
  return { from: startOfDay(now) - 6 * DAY, to: now };
}

export function summarize(b: Buckets, range: StRange, now: number): StSummary {
  const { from, to } = rangeBounds(range, now);
  const byDomain = sumByDomain(b, from, to);
  const domains = Object.entries(byDomain)
    .map(([domain, ms]) => ({ domain, ms }))
    .filter((d) => d.ms >= 1000)
    .sort((a, b) => b.ms - a.ms);
  const total = domains.reduce((a, d) => a + d.ms, 0);

  const series: StSummary['series'] = [];
  if (range === '7d') {
    for (let i = 0; i < 7; i++) {
      const s = startOfDay(now) - (6 - i) * DAY;
      series.push({ start: s, ms: sumAll(b, s, Math.min(s + DAY, to)) });
    }
  } else {
    const firstHour = range === '24h' ? Math.floor(now / HOUR) * HOUR - 23 * HOUR : startOfDay(now);
    for (let s = firstHour; s <= now; s += HOUR) series.push({ start: s, ms: sumAll(b, Math.max(s, from), Math.min(s + HOUR, to)) });
  }
  return { range, total, domains, series };
}

function sumAll(b: Buckets, from: number, to: number): number {
  return Object.values(sumByDomain(b, from, to)).reduce((a, v) => a + v, 0);
}
