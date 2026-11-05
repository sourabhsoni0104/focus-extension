// SponsorBlock, Return YouTube Dislike and DeArrow lookups.
// SponsorBlock/DeArrow use hash-prefix endpoints so the server never learns the exact video id.
import type { SbCategory } from '../../lib/defaults';
import type { Branding, SbSegment } from '../../lib/types';

const SB = 'https://sponsor.ajay.app';
const RYD = 'https://returnyoutubedislikeapi.com';
const TTL = 30 * 60 * 1000;

const memo = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  if (memo.size > 500) memo.delete(memo.keys().next().value!);
  return value;
}

async function hashPrefix(videoId: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoId));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 4);
}

interface SbResponse {
  videoID: string;
  segments: { segment: [number, number]; category: string; UUID: string; actionType: string }[];
}

export function sponsorSegments(videoId: string, categories: SbCategory[]): Promise<SbSegment[]> {
  if (!categories.length) return Promise.resolve([]);
  return cached(`sb:${videoId}:${categories.join()}`, async () => {
    const qs = new URLSearchParams({ categories: JSON.stringify(categories), actionTypes: JSON.stringify(['skip']) });
    const res = await fetch(`${SB}/api/skipSegments/${await hashPrefix(videoId)}?${qs}`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`SponsorBlock ${res.status}`);
    const list = (await res.json()) as SbResponse[];
    return (list.find((v) => v.videoID === videoId)?.segments ?? [])
      .map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category, uuid: s.UUID }))
      .sort((a, b) => a.start - b.start);
  });
}

export function dislikes(videoId: string) {
  return cached(`ryd:${videoId}`, async () => {
    const res = await fetch(`${RYD}/votes?videoId=${encodeURIComponent(videoId)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { likes: number; dislikes: number };
    return { likes: j.likes, dislikes: j.dislikes };
  });
}

interface BrandingResponse {
  titles: { title: string; original: boolean; votes: number; locked: boolean }[];
  thumbnails: { timestamp?: number; original: boolean; votes: number; locked: boolean }[];
}

/** Clean DeArrow formatting markers: a leading ">" on a word means "keep this word's casing". */
export const cleanDearrowTitle = (t: string) => t.replace(/(^|\s)>(?=\S)/g, '$1').trim();

export async function branding(videoId: string): Promise<Branding | null> {
  const prefix = await hashPrefix(videoId);
  const all = await cached(`da:${prefix}`, async () => {
    const res = await fetch(`${SB}/api/branding/${prefix}`);
    if (!res.ok) return {} as Record<string, BrandingResponse>;
    return (await res.json()) as Record<string, BrandingResponse>;
  });
  const b = all[videoId];
  if (!b) return null;
  const title = b.titles.find((t) => !t.original && (t.locked || t.votes >= 0));
  const thumb = b.thumbnails.find((t) => !t.original && (t.locked || t.votes >= 0) && typeof t.timestamp === 'number');
  if (!title && !thumb) return null;
  return { title: title ? cleanDearrowTitle(title.title) : undefined, thumbTime: thumb?.timestamp };
}
