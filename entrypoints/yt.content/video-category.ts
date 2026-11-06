// Video categories without an API key: asks YouTube's own player endpoint from the page
// (YouTube rejects the same request from the extension's background). Results are cached in localStorage.
import { categoryIdByName } from '../../lib/categories';
import type { VideoMeta } from '../../lib/types';

const CACHE_KEY = 'focus_vcat';
const CACHE_CAP = 3000;
const MAX_PARALLEL = 6;
const CLIENT = { clientName: 'WEB', clientVersion: '2.20251101.00.00', hl: 'en' };

let store: Record<string, string> | null = null;
function cache(): Record<string, string> {
  if (!store) {
    try {
      store = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, string>;
    } catch {
      store = {};
    }
  }
  return store;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const c = cache();
    const keys = Object.keys(c);
    if (keys.length > CACHE_CAP) keys.slice(0, keys.length - CACHE_CAP + 300).forEach((k) => delete c[k]);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch {
      /* quota */
    }
  }, 1000);
}

async function fetchCategory(id: string): Promise<string> {
  const res = await fetch('/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId: id, context: { client: CLIENT } }),
  });
  if (!res.ok) throw new Error(`player ${res.status}`);
  const data = (await res.json()) as { microformat?: { playerMicroformatRenderer?: { category?: string } } };
  return categoryIdByName(data.microformat?.playerMicroformatRenderer?.category);
}

/** Category ids for videos (title is left empty; "original titles" still needs the API key). */
export async function keylessMeta(ids: string[]): Promise<Record<string, VideoMeta>> {
  const c = cache();
  const out: Record<string, VideoMeta> = {};
  const todo = [...new Set(ids)].filter((id) => {
    if (c[id] !== undefined) out[id] = { c: c[id]!, t: '' };
    return c[id] === undefined;
  });
  const worker = async () => {
    for (let id = todo.shift(); id; id = todo.shift()) {
      try {
        c[id] = await fetchCategory(id);
        out[id] = { c: c[id]!, t: '' };
      } catch {
        /* leave unknown; asked again next page load */
      }
    }
  };
  await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));
  scheduleSave();
  return out;
}
