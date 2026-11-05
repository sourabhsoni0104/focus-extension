// Removes YouTube's "ad blockers are not allowed" dialog and resumes playback.
import { getVideoEl, type Mod } from './ctx';
import { ANTI_ADBLOCK } from './selectors';

export const antiAdblock: Mod = {
  scan(ctx) {
    if (!ctx.s.enabled || !ctx.s.ads.enabled || !ctx.s.ads.antiAdblock) return;
    const msg = document.querySelector(ANTI_ADBLOCK);
    if (!msg) return;
    msg.closest('tp-yt-paper-dialog')?.remove();
    msg.remove();
    document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach((b) => b.remove());
    const v = getVideoEl();
    if (v?.paused) void v.play().catch(() => undefined);
  },
};
