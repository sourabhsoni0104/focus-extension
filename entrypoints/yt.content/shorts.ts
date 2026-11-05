// Opens Shorts in the normal player and hides leftover "Shorts" chips.
import type { Ctx, Mod } from './ctx';
import { SKIP_CHIP } from './selectors';

const shortsId = (path: string) => path.match(/^\/shorts\/([\w-]{11})/)?.[1];

let enabled = () => false;

function redirectIfShorts() {
  const id = shortsId(location.pathname);
  if (id && enabled()) location.replace(`/watch?v=${id}`);
}

export function installShortsRedirect(get: () => Ctx['s']) {
  enabled = () => {
    const s = get();
    return s.enabled && s.focus.redirectShorts;
  };
  // Intercept clicks before YouTube's own router sees them.
  window.addEventListener(
    'click',
    (e) => {
      if (!enabled() || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="/shorts/"]') as HTMLAnchorElement | null;
      const id = a && shortsId(a.getAttribute('href') ?? '');
      if (!id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      location.assign(`/watch?v=${id}`);
    },
    true,
  );
}

export const shorts: Mod = {
  settings: () => redirectIfShorts(),
  navigate: () => redirectIfShorts(),
  scan(ctx) {
    if (!ctx.s.enabled || !ctx.s.focus.hideShorts) return;
    document.querySelectorAll<HTMLElement>(SKIP_CHIP).forEach((chip) => {
      if (!chip.dataset.focusHide && chip.textContent?.trim() === 'Shorts') chip.dataset.focusHide = 'hide';
    });
  },
};
