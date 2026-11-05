// ISOLATED-world content script for youtube.com: settings, styles, feed filtering and page features.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { CFG_CACHE_KEY, emit, on, TO_ISO, TO_MAIN } from '../../lib/bridge';
import { withDefaults, type ChannelRef, type Settings } from '../../lib/defaults';
import { throttle } from '../../lib/dom';
import { effectiveSettings, focusReason } from '../../lib/effective';
import { pageOf, parseChannelHref } from '../../lib/match';
import type { TabMessage } from '../../lib/messages';
import { loadSettings, updatePath } from '../../lib/settings';
import type { PomoState, TabStatus } from '../../lib/types';
import { antiAdblock } from './anti-adblock';
import { community, installSponsorSkip } from './community';
import { controlsMod, installAbLoop } from './controls';
import { buildCss } from './css';
import type { Ctx, Mod } from './ctx';
import { feedFilter } from './feed-filter';
import { home } from './home';
import { limitsMod } from './limits';
import { CHANNEL_HEADER_NAME, WATCH_CHANNEL_LINK } from './selectors';
import { installShortsRedirect, shorts } from './shorts';
import { installWatchListeners, watchPage } from './watch-page';

function readCache(): Settings {
  try {
    return withDefaults(JSON.parse(localStorage.getItem(CFG_CACHE_KEY) ?? 'null'));
  } catch {
    return withDefaults(null);
  }
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_start',
  main() {
    const cached = readCache();
    let raw: Settings = cached;
    let pomo: PomoState | undefined;

    const ctx: Ctx = {
      s: cached,
      raw,
      reason: { schedule: false, pomodoro: false },
      page: pageOf(location.pathname),
      video: null,
      version: 0,
      rescan: () => scan(),
    };
    const getCtx = () => ctx;

    // Styles go in immediately (from the cached copy) so hidden things never flash.
    const style = document.createElement('style');
    style.id = 'focus-style';
    style.textContent = buildCss(cached);
    const mountStyle = () => {
      if (!style.isConnected) (document.head ?? document.documentElement).appendChild(style);
    };
    mountStyle();
    document.documentElement.setAttribute('focus-page', ctx.page);

    const mods: Mod[] = [feedFilter, home, shorts, watchPage, controlsMod(getCtx), community, limitsMod(getCtx), antiAdblock];
    const each = (fn: (m: Mod) => void) =>
      mods.forEach((m) => {
        try {
          fn(m);
        } catch (e) {
          console.debug('[FOCUS]', e);
        }
      });

    const scan = throttle(() => {
      mountStyle();
      each((m) => m.scan?.(ctx));
    }, 200);

    function recompute() {
      ctx.raw = raw;
      ctx.reason = focusReason(raw, pomo);
      ctx.s = effectiveSettings(raw, pomo);
      ctx.version++;
      style.textContent = buildCss(ctx.s);
      try {
        localStorage.setItem(CFG_CACHE_KEY, JSON.stringify(ctx.s));
      } catch {
        /* quota */
      }
      emit(TO_MAIN, { type: 'settings', settings: ctx.s });
      each((m) => m.settings?.(ctx));
      scan();
    }

    function onNavigate() {
      const page = pageOf(location.pathname);
      ctx.page = page;
      document.documentElement.setAttribute('focus-page', page);
      each((m) => m.navigate?.(ctx));
      scan();
    }

    installShortsRedirect(() => ctx.s);
    installWatchListeners(getCtx);
    installAbLoop();
    installSponsorSkip(getCtx);

    document.addEventListener('yt-navigate-finish', onNavigate);
    document.addEventListener('yt-page-data-updated', onNavigate);
    window.addEventListener('popstate', onNavigate);
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });

    on(TO_ISO, (msg) => {
      if (msg.type === 'ready') emit(TO_MAIN, { type: 'settings', settings: ctx.s });
      else if (msg.type === 'video') {
        const changed = msg.video.videoId !== ctx.video?.videoId;
        ctx.video = msg.video;
        each((m) => m.video?.(ctx, changed));
        if (changed) scan();
      } else if (msg.type === 'saveSpeed') {
        if (msg.perChannel && msg.channelId) void updatePath(`player.channelSpeeds.${msg.channelId}`, msg.value);
        else void updatePath('player.defaultSpeed', msg.value);
      } else if (msg.type === 'saveBoost') void updatePath('player.volumeBoost', msg.value);
    });

    function currentChannel(): ChannelRef | undefined {
      if (ctx.page === 'watch') {
        const a = document.querySelector<HTMLAnchorElement>(WATCH_CHANNEL_LINK);
        const ref = parseChannelHref(a?.getAttribute('href'));
        const name = ctx.video?.author ?? a?.textContent?.trim() ?? '';
        return { id: ctx.video?.channelId ?? ref.id, handle: ref.handle, name };
      }
      if (ctx.page === 'channel') {
        const ref = parseChannelHref(location.pathname);
        const name = document.querySelector(CHANNEL_HEADER_NAME)?.textContent?.trim() || ref.handle || '';
        return { ...ref, name };
      }
      return undefined;
    }

    chrome.runtime.onMessage.addListener((msg: TabMessage, _sender, respond) => {
      if (msg.type === 'tab:status') {
        const page = ctx.page === 'subscriptions' ? 'other' : ctx.page;
        respond({ page, video: ctx.page === 'watch' ? ctx.video ?? undefined : undefined, channel: currentChannel() } satisfies TabStatus);
      } else if (msg.type === 'tab:speed') {
        emit(TO_MAIN, { type: 'speed', value: msg.value });
        respond(true);
      } else if (msg.type === 'tab:boost') {
        emit(TO_MAIN, { type: 'boost', value: msg.value });
        respond(true);
      }
      return false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let dirty = false;
      if (changes.settings) {
        raw = withDefaults(changes.settings.newValue);
        dirty = true;
      }
      if (changes.pomo) {
        pomo = changes.pomo.newValue as PomoState | undefined;
        dirty = true;
      }
      if (dirty) recompute();
    });

    // Focus schedule boundaries.
    setInterval(() => {
      const r = focusReason(raw, pomo);
      if (r.schedule !== ctx.reason.schedule || r.pomodoro !== ctx.reason.pomodoro) recompute();
    }, 30000);

    void Promise.all([loadSettings(), chrome.storage.local.get('pomo')]).then(([s, got]) => {
      raw = s;
      pomo = got.pomo as PomoState | undefined;
      recompute();
    });
  },
});
