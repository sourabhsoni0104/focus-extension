// Turn whatever the user typed (URL, @handle, channel id, name) into a ChannelRef with an id when possible.
import type { ChannelRef } from '../../lib/defaults';
import { loadSettings } from '../../lib/settings';
import { channelByHandle } from './youtube-api';

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

async function fromPage(path: string): Promise<ChannelRef | null> {
  const res = await fetch(`https://www.youtube.com${path}`, { credentials: 'omit' });
  if (!res.ok) return null;
  const html = await res.text();
  const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1]
    ?? html.match(/"externalId":"(UC[\w-]{22})"/)?.[1];
  if (!id) return null;
  const name = decodeEntities(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '');
  const handle = html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/)?.[1]?.toLowerCase()
    ?? (path.startsWith('/@') ? path.slice(1).split('/')[0]?.toLowerCase() : undefined);
  return { id, handle, name: name || handle || id };
}

export async function resolveChannel(input: string): Promise<ChannelRef> {
  const raw = input.trim();
  if (!raw) throw new Error('Empty channel');

  let path: string | null = null;
  if (/^https?:\/\//i.test(raw) || raw.includes('youtube.com/')) {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    path = u.pathname.split('/').slice(0, 3).join('/');
    if (path.startsWith('/@')) path = '/' + path.split('/')[1];
  } else if (raw.startsWith('@')) path = `/${raw}`;
  else if (/^UC[\w-]{22}$/.test(raw)) path = `/channel/${raw}`;

  if (path) {
    const ref = await fromPage(path).catch(() => null);
    if (ref) return ref;
    const handle = path.match(/^\/(@[^/]+)/)?.[1];
    if (handle && (await loadSettings()).api.youtubeKey) {
      const viaApi = await channelByHandle(handle).catch(() => null);
      if (viaApi) return { id: viaApi.id, handle: handle.toLowerCase(), name: viaApi.name };
    }
    const id = path.match(/^\/channel\/(UC[\w-]{22})/)?.[1];
    if (id) return { id, name: id };
    if (handle) return { handle: handle.toLowerCase(), name: handle };
    throw new Error('Could not find that channel');
  }

  // A plain name: try it as a handle, otherwise match by name only.
  const guess = await fromPage(`/@${encodeURIComponent(raw.replace(/\s+/g, ''))}`).catch(() => null);
  if (guess && guess.name.toLowerCase() === raw.toLowerCase()) return guess;
  return { name: raw };
}
