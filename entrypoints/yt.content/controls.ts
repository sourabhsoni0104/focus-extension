// Extra buttons in the player's control bar: speed, loop, A-B loop, screenshot, picture-in-picture, cinema.
import { emit, TO_MAIN } from '../../lib/bridge';
import { h, icon, toast } from '../../lib/dom';
import { getVideoEl, type Ctx, type Mod } from './ctx';
import { RIGHT_CONTROLS } from './selectors';

const ICONS = {
  loop: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  shot: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2 7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.17L15 2H9z',
  pip: 'M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z',
  cinema: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z',
};
const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];

let ab: { a?: number; b?: number } = {};
let speedLabel: HTMLElement | null = null;
let abButton: HTMLElement | null = null;

const stop = (fn: (e: Event) => void) => ((e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  fn(e);
}) as EventListener;

function setSpeed(v: number) {
  emit(TO_MAIN, { type: 'speed', value: Math.min(16, Math.max(0.1, Math.round(v * 100) / 100)) });
}

function screenshot(ctx: Ctx) {
  const v = getVideoEl();
  if (!v || !v.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  const t = Math.floor(v.currentTime);
  const stamp = `${Math.floor(t / 60)}m${String(t % 60).padStart(2, '0')}s`;
  const name = `${(ctx.video?.title ?? 'youtube').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)} ${stamp}.png`;
  c.toBlob((blob) => {
    if (!blob) return;
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Screenshot saved');
  }, 'image/png');
}

async function togglePip() {
  const v = getVideoEl();
  if (!v) return;
  if (document.pictureInPictureElement) await document.exitPictureInPicture();
  else {
    v.disablePictureInPicture = false;
    await v.requestPictureInPicture().catch(() => toast('Picture-in-picture not available'));
  }
}

function toggleCinema(btn: HTMLElement) {
  const on = document.documentElement.classList.toggle('focus-cinema');
  btn.classList.toggle('focus-on', on);
  document.getElementById('focus-cinema')?.remove();
  if (on) {
    document.body.appendChild(
      h('div', {
        id: 'focus-cinema',
        onclick: () => {
          document.documentElement.classList.remove('focus-cinema');
          btn.classList.remove('focus-on');
          document.getElementById('focus-cinema')?.remove();
        },
      }),
    );
  }
}

function updateAbLabel() {
  if (!abButton) return;
  abButton.textContent = ab.b !== undefined ? 'A↔B' : ab.a !== undefined ? 'A…' : 'A-B';
  abButton.classList.toggle('focus-on', ab.a !== undefined);
}

function build(ctx: () => Ctx): HTMLElement {
  speedLabel = h('button', {
    class: 'ytp-button focus-speed',
    title: 'Speed (click to cycle, scroll to fine-tune)',
    onclick: stop(() => {
      const cur = getVideoEl()?.playbackRate ?? 1;
      setSpeed(SPEEDS.find((s) => s > cur + 0.01) ?? SPEEDS[0]!);
    }),
    onwheel: stop((e) => {
      const cur = getVideoEl()?.playbackRate ?? 1;
      setSpeed(cur + ((e as WheelEvent).deltaY < 0 ? 0.25 : -0.25));
    }),
  }, '1x');

  const loop = h('button', {
    class: 'ytp-button',
    title: 'Loop',
    onclick: stop(() => {
      const v = getVideoEl();
      if (!v) return;
      v.loop = !v.loop;
      loop.classList.toggle('focus-on', v.loop);
      toast(v.loop ? 'Loop on' : 'Loop off');
    }),
  }, icon(ICONS.loop));

  abButton = h('button', {
    class: 'ytp-button focus-ab',
    title: 'A-B loop: click to set start, again to set end, again to clear',
    onclick: stop(() => {
      const v = getVideoEl();
      if (!v) return;
      if (ab.a === undefined) ab = { a: v.currentTime };
      else if (ab.b === undefined && v.currentTime > ab.a + 0.5) ab = { a: ab.a, b: v.currentTime };
      else ab = {};
      updateAbLabel();
    }),
  }, 'A-B');

  const shot = h('button', { class: 'ytp-button', title: 'Screenshot', onclick: stop(() => screenshot(ctx())) }, icon(ICONS.shot));
  const pip = h('button', { class: 'ytp-button', title: 'Picture-in-picture', onclick: stop(() => void togglePip()) }, icon(ICONS.pip));
  const cinema: HTMLElement = h('button', { class: 'ytp-button', title: 'Cinema mode (dim the page)', onclick: stop(() => toggleCinema(cinema)) }, icon(ICONS.cinema));

  return h('span', { id: 'focus-controls' }, speedLabel, loop, abButton, shot, pip, cinema);
}

export function installAbLoop() {
  document.addEventListener(
    'timeupdate',
    (e) => {
      const v = e.target;
      if (v instanceof HTMLVideoElement && ab.a !== undefined && ab.b !== undefined && v.currentTime >= ab.b) v.currentTime = ab.a;
    },
    true,
  );
}

export function controlsMod(getCtx: () => Ctx): Mod {
  return {
    scan(ctx) {
      const want = ctx.s.enabled && ctx.s.player.controls;
      const existing = document.getElementById('focus-controls');
      if (!want) return existing?.remove();
      const right = document.querySelector(RIGHT_CONTROLS);
      if (!right || (existing && right.contains(existing))) return;
      existing?.remove();
      right.prepend(build(getCtx));
      this.video?.(ctx, false);
    },
    video(ctx, changed) {
      if (changed) {
        ab = {};
        updateAbLabel();
      }
      if (speedLabel && ctx.video) speedLabel.textContent = `${ctx.video.speed}x`;
    },
  };
}
