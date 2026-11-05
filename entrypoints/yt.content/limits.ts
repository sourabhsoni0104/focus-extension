// Daily YouTube time limit overlay (with a friction countdown before "5 more minutes").
import { h } from '../../lib/dom';
import { duration } from '../../lib/format';
import { getVideoEl, safeSend, type Ctx, type Mod } from './ctx';

const SNOOZE_KEY = 'limit_snooze_until';
const SNOOZE_MS = 5 * 60 * 1000;
let checkTimer: ReturnType<typeof setInterval> | undefined;
let blocking = false;

async function snoozedUntil(): Promise<number> {
  try {
    return ((await chrome.storage.local.get(SNOOZE_KEY))[SNOOZE_KEY] as number | undefined) ?? 0;
  } catch {
    return 0;
  }
}

function keepPaused() {
  if (blocking) getVideoEl()?.pause();
}

function showOverlay(ctx: Ctx, used: number) {
  if (document.getElementById('focus-limit')) return;
  blocking = true;
  keepPaused();
  const secs = ctx.raw.limits.friction ? ctx.raw.limits.frictionSeconds : 0;
  const more = h('button', { disabled: secs > 0 }, secs > 0 ? `5 more minutes (${secs})` : '5 more minutes');
  let left = secs;
  const timer = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(timer);
      more.disabled = false;
      more.textContent = '5 more minutes';
    } else more.textContent = `5 more minutes (${left})`;
  }, 1000);
  more.addEventListener('click', async () => {
    await chrome.storage.local.set({ [SNOOZE_KEY]: Date.now() + SNOOZE_MS }).catch(() => undefined);
    blocking = false;
    document.getElementById('focus-limit')?.remove();
  });
  document.body.appendChild(
    h('div', { id: 'focus-limit' },
      h('div', null,
        h('h2', null, "That's enough YouTube for today"),
        h('p', null, `You've spent ${duration(used)} here today. Your daily limit is ${ctx.raw.limits.dailyMinutes} minutes.`),
        more,
      ),
    ),
  );
}

async function check(ctx: Ctx) {
  const limit = ctx.raw.limits.dailyMinutes;
  if (!ctx.raw.enabled || limit <= 0) {
    blocking = false;
    document.getElementById('focus-limit')?.remove();
    return;
  }
  if (Date.now() < (await snoozedUntil())) return;
  const used = await safeSend('st:domainTime', { domain: 'youtube.com', range: 'today' });
  if (used !== null && used >= limit * 60000) showOverlay(ctx, used);
}

export function limitsMod(getCtx: () => Ctx): Mod {
  document.addEventListener('play', keepPaused, true);
  return {
    settings(ctx) {
      clearInterval(checkTimer);
      void check(ctx);
      checkTimer = setInterval(() => void check(getCtx()), 60000);
    },
  };
}
