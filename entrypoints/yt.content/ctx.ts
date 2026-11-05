// Shared state for the ISOLATED-world modules.
import type { Settings } from '../../lib/defaults';
import type { FocusReason } from '../../lib/effective';
import type { Page } from '../../lib/match';
import { send, type MessageMap, type MessageType } from '../../lib/messages';
import type { CurrentVideo } from '../../lib/types';

export interface Ctx {
  /** Effective settings (with Deep Focus applied when active). */
  s: Settings;
  /** The user's saved settings. */
  raw: Settings;
  reason: FocusReason;
  page: Page;
  video: CurrentVideo | null;
  /** Bumped whenever settings change, so cached per-element decisions are recomputed. */
  version: number;
  rescan: () => void;
}

export interface Mod {
  settings?(ctx: Ctx): void;
  navigate?(ctx: Ctx): void;
  scan?(ctx: Ctx): void;
  video?(ctx: Ctx, changed: boolean): void;
}

/** send() that never throws (e.g. after the extension reloads and this content script is orphaned). */
export async function safeSend<K extends MessageType>(type: K, req: MessageMap[K]['req']): Promise<MessageMap[K]['res'] | null> {
  try {
    return await send(type, req);
  } catch {
    return null;
  }
}

export const getVideoEl = () => document.querySelector<HTMLVideoElement>('#movie_player video');
