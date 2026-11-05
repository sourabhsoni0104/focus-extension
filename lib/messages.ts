// Typed messages between pages/content scripts and the background service worker.
import type { ChannelRef, SbCategory } from './defaults';
import type { Branding, PomoState, SbSegment, StRange, StSummary, VideoMeta } from './types';

export interface MessageMap {
  'st:summary': { req: { range: StRange }; res: StSummary };
  'st:domainTime': { req: { domain: string; range: StRange }; res: number };
  'st:reset': { req: Record<string, never>; res: true };
  'pomo:get': { req: Record<string, never>; res: PomoState };
  'pomo:action': { req: { action: 'start' | 'pause' | 'reset' | 'skip' }; res: PomoState };
  'yt:categories': { req: { force?: boolean }; res: { id: string; title: string }[] };
  'yt:videos': { req: { ids: string[] }; res: Record<string, VideoMeta> };
  'yt:testKey': { req: { key: string }; res: { ok: boolean; error?: string } };
  'channel:resolve': { req: { input: string }; res: ChannelRef };
  'sb:segments': { req: { videoId: string; categories: SbCategory[] }; res: SbSegment[] };
  'ryd:votes': { req: { videoId: string }; res: { likes: number; dislikes: number } | null };
  'da:branding': { req: { videoId: string }; res: Branding | null };
  'ui:openOptions': { req: { hash?: string }; res: true };
}

export type MessageType = keyof MessageMap;
export type Message<K extends MessageType = MessageType> = { type: K } & MessageMap[K]['req'];
type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

export async function send<K extends MessageType>(type: K, req: MessageMap[K]['req']): Promise<MessageMap[K]['res']> {
  const reply = (await chrome.runtime.sendMessage({ type, ...req })) as Reply<MessageMap[K]['res']> | undefined;
  if (!reply) throw new Error('No response from background');
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

export type Handlers = {
  [K in MessageType]: (req: Message<K>, sender: chrome.runtime.MessageSender) => Promise<MessageMap[K]['res']> | MessageMap[K]['res'];
};

export function listen(handlers: Handlers) {
  chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    const handler = handlers[msg?.type] as ((m: Message, s: chrome.runtime.MessageSender) => unknown) | undefined;
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(msg, sender))
      .then(
        (data) => sendResponse({ ok: true, data }),
        (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    return true;
  });
}

// Messages from the popup to a YouTube tab's content script.
export type TabMessage =
  | { type: 'tab:status' }
  | { type: 'tab:speed'; value: number }
  | { type: 'tab:boost'; value: number };
