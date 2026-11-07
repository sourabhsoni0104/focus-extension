// SponsorBlock skipping (automatic or via a floating Skip button) + progress-bar segments, Return YouTube Dislike counts, DeArrow/original title on the watch page.
import { SB_CATEGORIES, type SbCategory } from '../../lib/defaults';
import { h, icon, replaceChildren, toast } from '../../lib/dom';
import { compactNumber } from '../../lib/format';
import type { SbSegment } from '../../lib/types';
import { getVideoEl, safeSend, type Ctx, type Mod } from './ctx';
import { displayTitle, requestTitleData, setTitle } from './feed-filter';
import { DISLIKE_BUTTON, PROGRESS_BAR, WATCH_TITLE } from './selectors';

const SB_COLORS: Record<string, string> = {
  sponsor: '#00d400',
  selfpromo: '#ffff00',
  interaction: '#cc00ff',
  intro: '#00ffff',
  outro: '#0202ed',
  preview: '#008fd6',
  music_offtopic: '#ff9900',
  filler: '#7300ff',
};
const SB_LABELS: Record<string, string> = {
  sponsor: 'sponsor',
  selfpromo: 'self-promotion',
  interaction: 'interaction reminder',
  intro: 'intro',
  outro: 'outro',
  preview: 'preview',
  music_offtopic: 'non-music section',
  filler: 'filler',
};

const SKIP_LABELS: Record<string, string> = {
  sponsor: 'Skip sponsor',
  selfpromo: 'Skip self-promo',
  interaction: 'Skip reminder',
  intro: 'Skip intro',
  outro: 'Skip outro',
  preview: 'Skip preview',
  music_offtopic: 'Skip non-music',
  filler: 'Skip filler',
};
const SKIP_ICON = 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z';

let segments: SbSegment[] = [];
let segmentsFor = '';
const skipped = new Set<string>();
const undone = new Set<string>();
let votes: { id: string; dislikes: number } | null = null;

// --- floating Skip button (bottom right of the player while inside a segment) ---
let skipBtn: HTMLButtonElement | null = null;
let offered: SbSegment | null = null;

function offerSkip(seg: SbSegment | null) {
  const host = document.querySelector('#movie_player');
  if (!seg || !host) {
    offered = null;
    skipBtn?.classList.remove('show');
    return;
  }
  if (seg.uuid === offered?.uuid && skipBtn?.parentElement === host) return;
  offered = seg;
  if (!skipBtn) {
    skipBtn = h('button', { id: 'focus-skip', type: 'button' });
    const stop = (e: Event) => e.stopPropagation(); // keep YouTube from treating the click as play/pause
    skipBtn.addEventListener('mousedown', stop);
    skipBtn.addEventListener('dblclick', stop);
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = getVideoEl();
      if (v && offered) v.currentTime = offered.end;
      offerSkip(null);
    });
  }
  replaceChildren(skipBtn, h('span', null, SKIP_LABELS[seg.category] ?? 'Skip'), icon(SKIP_ICON, 20));
  if (skipBtn.parentElement !== host) {
    skipBtn.classList.remove('show');
    host.appendChild(skipBtn);
  }
  const btn = skipBtn;
  requestAnimationFrame(() => offered && btn.classList.add('show'));
}

export function installSponsorSkip(get: () => Ctx) {
  document.addEventListener(
    'timeupdate',
    (e) => {
      const v = e.target;
      const ctx = get();
      if (!(v instanceof HTMLVideoElement)) return;
      const off = !segments.length || !ctx.s.enabled || !ctx.s.community.sponsorblock;
      if (off || document.querySelector('#movie_player.ad-showing') || segmentsFor !== ctx.video?.videoId) return offerSkip(null);
      const t = v.currentTime;
      let offer: SbSegment | null = null;
      for (const seg of segments) {
        if (t < seg.start || t >= seg.end - 0.3) continue;
        const action = ctx.s.community.sbActions[seg.category as SbCategory];
        if (action === 'button') offer ??= seg;
        else if (action === 'auto' && !skipped.has(seg.uuid) && !undone.has(seg.uuid)) {
          skipped.add(seg.uuid);
          v.currentTime = seg.end;
          toast(`Skipped ${SB_LABELS[seg.category] ?? seg.category}`, {
            action: 'Undo',
            ms: 4000,
            onAction: () => {
              undone.add(seg.uuid);
              v.currentTime = seg.start;
            },
          });
          break;
        }
      }
      offerSkip(offer);
    },
    true,
  );
  // Seeking back before a segment arms it again.
  document.addEventListener(
    'seeked',
    (e) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement)) return;
      for (const seg of segments) if (v.currentTime < seg.start - 1) skipped.delete(seg.uuid);
    },
    true,
  );
}

function drawBar(ctx: Ctx) {
  const bar = document.querySelector(PROGRESS_BAR);
  const v = getVideoEl();
  const existing = bar?.querySelector('.focus-sb-bar');
  const show = ctx.s.enabled && ctx.s.community.sponsorblock && ctx.s.community.sbShowBar && segments.length && segmentsFor === ctx.video?.videoId;
  if (!bar || !v || !show || !Number.isFinite(v.duration) || v.duration <= 0) {
    if (!show) existing?.remove();
    return;
  }
  const sig = `${segmentsFor}|${Math.round(v.duration)}`;
  if ((existing as HTMLElement | null)?.dataset.sig === sig) return;
  existing?.remove();
  const d = v.duration;
  bar.appendChild(
    h('div', { class: 'focus-sb-bar', 'data-sig': sig },
      segments.map((seg) =>
        h('div', {
          style: {
            left: `${(seg.start / d) * 100}%`,
            width: `${Math.max(0.3, ((seg.end - seg.start) / d) * 100)}%`,
            background: SB_COLORS[seg.category] ?? '#888',
          },
        }),
      ),
    ),
  );
}

function drawDislikes(ctx: Ctx) {
  // Only the button under the video: the full-screen like/dislike pill in the player has no room for a count.
  const btn = [...document.querySelectorAll(DISLIKE_BUTTON)].find((b) => !b.closest('#movie_player'));
  document.querySelectorAll('#movie_player .focus-dislikes').forEach((el) => el.remove());
  const existing = document.querySelector<HTMLElement>('.focus-dislikes');
  const show = ctx.s.enabled && ctx.s.community.dislikes && votes && votes.id === ctx.video?.videoId;
  if (!show || !btn) {
    if (!show) existing?.remove();
    return;
  }
  const text = compactNumber(votes!.dislikes);
  if (existing && btn.contains(existing)) {
    if (existing.textContent !== text) existing.textContent = text;
    return;
  }
  existing?.remove();
  const label = btn.querySelector('.yt-spec-button-shape-next__button-text-content');
  if (label) label.textContent = text;
  else btn.appendChild(h('span', { class: 'focus-dislikes' }, text));
  if (label) label.classList.add('focus-dislikes');
}

export const community: Mod = {
  async video(ctx, changed) {
    const v = ctx.video;
    if (!changed || !v || !ctx.s.enabled) return;
    const c = ctx.s.community;
    skipped.clear();
    undone.clear();
    offerSkip(null);
    segments = [];
    segmentsFor = v.videoId;
    votes = null;
    if (c.sponsorblock) {
      const cats = SB_CATEGORIES.filter((k) => c.sbActions[k] !== 'off');
      const segs = await safeSend('sb:segments', { videoId: v.videoId, categories: [...cats] });
      if (segmentsFor === v.videoId) segments = segs ?? [];
    }
    if (c.dislikes) {
      const r = await safeSend('ryd:votes', { videoId: v.videoId });
      if (r && ctx.video?.videoId === v.videoId) votes = { id: v.videoId, dislikes: r.dislikes };
    }
    requestTitleData(ctx, v.videoId);
    ctx.rescan();
  },
  scan(ctx) {
    if (ctx.page !== 'watch' || !ctx.video) return;
    drawBar(ctx);
    drawDislikes(ctx);
    const title = ctx.s.enabled ? displayTitle(ctx, ctx.video.videoId) : undefined;
    const el = document.querySelector(WATCH_TITLE);
    if (el) setTitle(el, title);
  },
};
