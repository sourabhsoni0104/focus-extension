// Fallback for ads that still play: mute, fast-forward, click Skip, then restore.
import type { Settings } from '../../lib/defaults';

const SKIP_BUTTONS = [
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button-slot button',
  'button[id^="skip-button"]',
].join(',');

export function startAdSkipper(get: () => Settings, onAdEnd: () => void) {
  let inAd = false;
  let prevMuted = false;

  setInterval(() => {
    const s = get();
    const player = document.querySelector<HTMLElement>('#movie_player');
    const video = player?.querySelector<HTMLVideoElement>('video');
    if (!player || !video) return;
    const isAd = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');

    if (isAd && s.enabled && s.ads.enabled && s.ads.autoSkip) {
      if (!inAd) {
        inAd = true;
        prevMuted = video.muted;
      }
      video.muted = true;
      if (video.playbackRate < 16) video.playbackRate = 16;
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.2) {
        video.currentTime = video.duration - 0.1;
      }
      document.querySelectorAll<HTMLElement>(SKIP_BUTTONS).forEach((b) => b.click());
      if (video.paused) void video.play().catch(() => undefined);
    } else if (inAd && !isAd) {
      inAd = false;
      video.muted = prevMuted;
      onAdEnd();
    }
  }, 250);
}
