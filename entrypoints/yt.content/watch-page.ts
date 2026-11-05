// Watch-page behaviours: autoplay off, auto theater, auto transcript, pause when hidden, resume position.
import { getVideoEl, type Ctx, type Mod } from './ctx';
import { AUTOPLAY_TOGGLE, SIZE_BUTTON, TRANSCRIPT_BUTTON } from './selectors';

const POS_KEY = 'focus_positions';
let theaterDoneFor = '';
let transcriptDoneFor = '';
let autoplayCheckedUntil = 0;
let pausedByUs = false;

function positions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function savePosition(id: string, t: number | null) {
  const p = positions();
  if (t === null) delete p[id];
  else p[id] = Math.floor(t);
  const keys = Object.keys(p);
  if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete p[k]);
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

export function installWatchListeners(get: () => Ctx) {
  document.addEventListener('visibilitychange', () => {
    const { s } = get();
    const v = getVideoEl();
    if (!v || !s.enabled || !s.player.pauseOnHide || document.pictureInPictureElement) return;
    if (document.hidden && !v.paused) {
      v.pause();
      pausedByUs = true;
    } else if (!document.hidden && pausedByUs) {
      pausedByUs = false;
      void v.play().catch(() => undefined);
    }
  });

  let lastSave = 0;
  document.addEventListener(
    'timeupdate',
    (e) => {
      const ctx = get();
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || !ctx.s.player.resumePlayback || !ctx.video || ctx.page !== 'watch') return;
      if (document.querySelector('#movie_player.ad-showing')) return;
      if (Date.now() - lastSave < 5000 || v.duration < 600) return;
      lastSave = Date.now();
      const near = v.currentTime < 30 || v.currentTime > v.duration - 30;
      savePosition(ctx.video.videoId, near ? null : v.currentTime);
    },
    true,
  );
}

function clickAutoplayOff() {
  const toggle = document.querySelector<HTMLElement>(`${AUTOPLAY_TOGGLE}[aria-checked="true"]`);
  if (toggle) (toggle.closest('button') ?? toggle).click();
}

export const watchPage: Mod = {
  video(ctx, changed) {
    if (!changed || !ctx.video || !ctx.s.enabled) return;
    autoplayCheckedUntil = Date.now() + 8000;
    const v = getVideoEl();
    if (v && ctx.s.player.resumePlayback && !new URLSearchParams(location.search).has('t')) {
      const saved = positions()[ctx.video.videoId];
      if (saved && v.currentTime < 5) v.currentTime = saved;
    }
  },
  scan(ctx) {
    const s = ctx.s;
    if (!s.enabled || ctx.page !== 'watch') return;
    const vid = new URLSearchParams(location.search).get('v') ?? '';

    if (s.focus.disableAutoplay && Date.now() < autoplayCheckedUntil) clickAutoplayOff();

    if (s.player.autoTheater && theaterDoneFor !== vid && !document.fullscreenElement) {
      const flexy = document.querySelector('ytd-watch-flexy');
      const btn = document.querySelector<HTMLElement>(SIZE_BUTTON);
      if (flexy && btn) {
        theaterDoneFor = vid;
        if (!flexy.hasAttribute('theater')) btn.click();
      }
    }

    if (s.player.autoTranscript && transcriptDoneFor !== vid) {
      const btn = document.querySelector<HTMLElement>(TRANSCRIPT_BUTTON);
      if (btn) {
        transcriptDoneFor = vid;
        btn.click();
      }
    }
  },
};
