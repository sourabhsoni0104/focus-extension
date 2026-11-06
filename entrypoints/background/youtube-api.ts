// YouTube Data API v3: video categories and per-video metadata (category + original title), cached.
// Without a key, the category list is built in and per-video categories are looked up on the page (yt.content/video-category.ts).
import { VIDEO_CATEGORIES } from '../../lib/categories';
import { loadSettings } from '../../lib/settings';
import type { VideoMeta } from '../../lib/types';

const API = 'https://www.googleapis.com/youtube/v3';
const META_KEY = 'yt_vmeta';
const META_CAP = 5000;
const CATS_TTL = 7 * 24 * 3600 * 1000;

async function apiGet<T>(path: string, params: Record<string, string>, key?: string): Promise<T> {
  const apiKey = key ?? (await loadSettings()).api.youtubeKey;
  if (!apiKey) throw new Error('No YouTube API key set');
  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${API}/${path}?${qs}`);
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(body.error?.message ?? `YouTube API error ${res.status}`);
  return body;
}

interface CatResponse {
  items?: { id: string; snippet: { title: string; assignable: boolean } }[];
}

export async function listCategories(force = false): Promise<{ id: string; title: string }[]> {
  const { api } = await loadSettings();
  if (!api.youtubeKey) return VIDEO_CATEGORIES;
  const cacheKey = `yt_cats_${api.region}`;
  const cached = (await chrome.storage.local.get(cacheKey))[cacheKey] as { at: number; list: { id: string; title: string }[] } | undefined;
  if (!force && cached && Date.now() - cached.at < CATS_TTL) return cached.list;
  const data = await apiGet<CatResponse>('videoCategories', { part: 'snippet', regionCode: api.region || 'US', hl: 'en' });
  const list = (data.items ?? []).filter((c) => c.snippet.assignable).map((c) => ({ id: c.id, title: c.snippet.title }));
  await chrome.storage.local.set({ [cacheKey]: { at: Date.now(), list } });
  return list;
}

export async function testKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiGet<CatResponse>('videoCategories', { part: 'snippet', regionCode: 'US' }, key);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type MetaCache = Record<string, VideoMeta & { at: number }>;
let memo: MetaCache | null = null;
const inflight = new Map<string, Promise<void>>();

async function cache(): Promise<MetaCache> {
  memo ??= ((await chrome.storage.local.get(META_KEY))[META_KEY] as MetaCache | undefined) ?? {};
  return memo;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const c = await cache();
    const keys = Object.keys(c);
    if (keys.length > META_CAP) {
      keys.sort((a, b) => (c[a]?.at ?? 0) - (c[b]?.at ?? 0)).slice(0, keys.length - META_CAP + 500).forEach((k) => delete c[k]);
    }
    await chrome.storage.local.set({ [META_KEY]: c });
  }, 1000);
}

interface VideosResponse {
  items?: { id: string; snippet: { categoryId: string; title: string; defaultAudioLanguage?: string; defaultLanguage?: string } }[];
}

async function fetchBatch(ids: string[]) {
  const c = await cache();
  const data = await apiGet<VideosResponse>('videos', {
    part: 'snippet',
    id: ids.join(','),
    fields: 'items(id,snippet(categoryId,title,defaultAudioLanguage,defaultLanguage))',
  });
  const now = Date.now();
  for (const id of ids) c[id] = { c: '', t: '', at: now }; // remember missing/private videos too
  for (const it of data.items ?? []) {
    c[it.id] = { c: it.snippet.categoryId, t: it.snippet.title, l: it.snippet.defaultAudioLanguage ?? it.snippet.defaultLanguage, at: now };
  }
  scheduleSave();
}

export async function videoMeta(ids: string[]): Promise<Record<string, VideoMeta>> {
  const c = await cache();
  const unique = [...new Set(ids.filter((id) => /^[\w-]{11}$/.test(id)))];
  const missing = unique.filter((id) => !c[id] && !inflight.has(id));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const p = fetchBatch(batch).finally(() => batch.forEach((id) => inflight.delete(id)));
    batch.forEach((id) => inflight.set(id, p));
  }
  await Promise.allSettled(unique.map((id) => inflight.get(id)));
  const out: Record<string, VideoMeta> = {};
  for (const id of unique) {
    const m = c[id];
    if (m) out[id] = { c: m.c, t: m.t, l: m.l };
  }
  return out;
}

export async function channelByHandle(handle: string): Promise<{ id: string; name: string } | null> {
  const data = await apiGet<{ items?: { id: string; snippet: { title: string } }[] }>('channels', {
    part: 'snippet',
    forHandle: handle,
  });
  const it = data.items?.[0];
  return it ? { id: it.id, name: it.snippet.title } : null;
}
