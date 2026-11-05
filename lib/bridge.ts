// Messages between the MAIN-world script and the ISOLATED content script, via DOM CustomEvents.
// Payloads are JSON strings so they cross JavaScript worlds safely.
import type { Settings } from './defaults';
import type { CurrentVideo } from './types';

export const TO_MAIN = 'focus:toMain';
export const TO_ISO = 'focus:toIso';
export const CFG_CACHE_KEY = '__focus_cfg';

export type ToMain =
  | { type: 'settings'; settings: Settings }
  | { type: 'speed'; value: number }
  | { type: 'boost'; value: number };

export type ToIso =
  | { type: 'ready' }
  | { type: 'video'; video: CurrentVideo }
  | { type: 'saveSpeed'; value: number; channelId?: string; perChannel: boolean }
  | { type: 'saveBoost'; value: number };

export function emit(name: typeof TO_MAIN, msg: ToMain): void;
export function emit(name: typeof TO_ISO, msg: ToIso): void;
export function emit(name: string, msg: unknown) {
  document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(msg) }));
}

export function on(name: typeof TO_MAIN, cb: (msg: ToMain) => void): void;
export function on(name: typeof TO_ISO, cb: (msg: ToIso) => void): void;
export function on(name: string, cb: (msg: never) => void) {
  document.addEventListener(name, (e) => {
    const detail = (e as CustomEvent).detail;
    if (typeof detail !== 'string') return;
    try {
      cb(JSON.parse(detail) as never);
    } catch {
      /* ignore malformed */
    }
  });
}
