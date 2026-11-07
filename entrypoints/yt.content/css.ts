// Builds the injected stylesheet from the effective settings.
import type { Settings } from '../../lib/defaults';
import { allowlistEmpty } from '../../lib/match';
import { buttonByLabel, THUMBS } from './selectors';

const hide = (sels: string[]) => (sels.length ? `${sels.join(',\n')} { display: none !important; }\n` : '');

const SHORTS = [
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
  'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
  'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
  'ytm-shorts-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
  'ytd-reel-item-renderer',
  'ytd-guide-entry-renderer:has(a[title="Shorts"])',
  'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
  'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
  'ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
  'ytd-video-renderer:has(a[href^="/shorts/"])',
  'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
  'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
  'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
  'yt-lockup-view-model:has(a[href^="/shorts/"])',
  'yt-tab-shape[tab-title="Shorts"]',
];

const ADS = [
  '#masthead-ad',
  'ytd-ad-slot-renderer',
  'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
  'ytd-in-feed-ad-layout-renderer',
  'ytd-banner-promo-renderer',
  'ytd-statement-banner-renderer',
  'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)',
  'ytd-promoted-sparkles-web-renderer',
  'ytd-promoted-video-renderer',
  'ytd-display-ad-renderer',
  'ytd-compact-promoted-video-renderer',
  'ytd-search-pyv-renderer',
  'ytd-merch-shelf-renderer',
  'ytd-primetime-promo-renderer',
  'ytd-brand-video-singleton-renderer',
  'ytd-brand-video-shelf-renderer',
  'ytd-mealbar-promo-renderer',
  'yt-mealbar-promo-renderer',
  'ytd-ad-inline-playback-meta-block',
  '#player-ads',
  'ytd-player-legacy-desktop-watch-ads-renderer',
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
  '.ytp-ad-overlay-container',
  '.ytp-ad-overlay-slot',
  '.ytp-suggested-action',
  'tp-yt-paper-dialog:has(yt-mealbar-promo-renderer)',
];

const BASE = `
[data-focus-hide] { display: none !important; }
#focus-toast {
  position: absolute; top: 14%; left: 50%; transform: translateX(-50%);
  display: flex; gap: 12px; align-items: center;
  background: rgba(15,15,18,.86); color: #fff; padding: 8px 16px; border-radius: 20px;
  font: 500 15px/1.3 Roboto, Arial, sans-serif; z-index: 80;
  opacity: 0; pointer-events: none; transition: opacity .15s;
}
body > #focus-toast { position: fixed; top: 80px; z-index: 9999; }
#focus-toast.show { opacity: 1; pointer-events: auto; }
#focus-toast button {
  background: #fff; color: #111; border: 0; border-radius: 12px; padding: 3px 10px;
  font: 600 13px Roboto, Arial, sans-serif; cursor: pointer;
}
#focus-skip {
  position: absolute; right: 16px; bottom: 76px; z-index: 61;
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px 10px 18px;
  background: rgba(15,15,18,.82); color: #fff; border: 1px solid rgba(255,255,255,.3); border-radius: 8px;
  font: 600 15px/1 Roboto, Arial, sans-serif; cursor: pointer;
  opacity: 0; transform: translateY(8px); pointer-events: none;
  transition: opacity .2s, transform .2s, bottom .2s, background .15s, color .15s;
}
#focus-skip.show { opacity: 1; transform: none; pointer-events: auto; }
#focus-skip:hover { background: #fff; color: #0f0f0f; }
#movie_player.ytp-autohide #focus-skip { bottom: 28px; }
/* Full screen: sit above YouTube's like/dislike buttons in the bottom-right corner. */
#movie_player.ytp-fullscreen #focus-skip { bottom: 160px; right: 28px; padding: 14px 18px 14px 24px; font-size: 18px; }
#movie_player.ytp-small-mode #focus-skip { bottom: 12px; right: 8px; padding: 6px 8px 6px 10px; font-size: 12px; }
#focus-controls { display: inline-flex; align-items: center; height: 100%; vertical-align: top; }
/* Same size as YouTube's own control buttons (48px wide, 24px icons). */
#focus-controls .ytp-button {
  display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 100%;
  color: #fff; opacity: 1;
}
#focus-controls .ytp-button svg { width: 24px !important; height: 24px !important; }
#focus-controls .focus-speed { width: auto; min-width: 48px; padding: 0 8px; font: 500 15px Roboto, Arial, sans-serif; }
#focus-controls .focus-ab { width: auto; min-width: 48px; padding: 0 8px; font: 500 14px Roboto, Arial, sans-serif; }
#focus-controls .focus-on { color: #ff4e45; opacity: 1; }
.focus-sb-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 100%; pointer-events: none; z-index: 35; }
.focus-sb-bar > div { position: absolute; top: 0; height: 100%; opacity: .85; }
.focus-dislikes { margin-left: 6px; font: 500 14px Roboto, Arial, sans-serif; }
#focus-cinema { position: fixed; inset: 0; background: rgba(0,0,0,.92); z-index: 2000; }
html.focus-cinema #full-bleed-container, html.focus-cinema #player-container-outer,
html.focus-cinema #player-theater-container, html.focus-cinema ytd-watch-flexy #player {
  position: relative; z-index: 2001;
}
#focus-home { display: none; }
html[focus-page="home"] #focus-home { display: block; }
/* Own colors: YouTube's --yt-spec-* variables are not reliably defined any more. */
#focus-home {
  --fh-text: #0f0f0f; --fh-muted: #606060; --fh-chip: rgba(0,0,0,.05); --fh-chip-hover: rgba(0,0,0,.1);
  padding: 24px 16px 48px; color: var(--fh-text);
  font-family: Roboto, Arial, sans-serif;
}
html[dark] #focus-home {
  --fh-text: #f1f1f1; --fh-muted: #aaaaaa; --fh-chip: rgba(255,255,255,.1); --fh-chip-hover: rgba(255,255,255,.2);
}
#focus-home .fh-empty { max-width: 520px; margin: 10vh auto 0; text-align: center; }
#focus-home .fh-empty h2 { font-size: 24px; font-weight: 600; margin: 0 0 8px; }
#focus-home .fh-empty p { font-size: 15px; color: var(--fh-muted); margin: 0 0 20px; line-height: 1.5; }
#focus-home .fh-links { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
#focus-home .fh-links a, #focus-home .fh-btn {
  padding: 8px 16px; border-radius: 18px; background: var(--fh-chip);
  color: inherit; text-decoration: none; font-size: 14px; font-weight: 500; border: 0; cursor: pointer;
}
#focus-home .fh-links a:hover, #focus-home .fh-btn:hover { background: var(--fh-chip-hover); }
#focus-home .fh-stat { margin-top: 28px; font-size: 13px; color: var(--fh-muted); }
#focus-home .fh-head { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 16px; }
#focus-home .fh-head h2 { font-size: 20px; margin: 0; }
#focus-home .fh-head span { font-size: 13px; color: var(--fh-muted); }
#focus-home .fh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 32px 16px; }
#focus-home .fh-card { color: inherit; text-decoration: none; display: block; }
#focus-home .fh-card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 12px; display: block; background: rgba(127,127,127,.15); }
#focus-home .fh-card h3 {
  font-size: 16px; font-weight: 500; line-height: 22px; margin: 10px 0 4px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
#focus-home .fh-card p { font-size: 14px; color: var(--fh-muted); margin: 0; }
#focus-limit {
  position: fixed; inset: 0; z-index: 100000; background: rgba(10,10,12,.96); color: #fff;
  display: flex; align-items: center; justify-content: center; font-family: Roboto, Arial, sans-serif;
}
#focus-limit > div { max-width: 460px; text-align: center; padding: 24px; }
#focus-limit h2 { font-size: 28px; margin: 0 0 10px; }
#focus-limit p { font-size: 16px; color: #bbb; line-height: 1.5; margin: 0 0 24px; }
#focus-limit button {
  background: #fff; color: #111; border: 0; border-radius: 20px; padding: 10px 20px;
  font: 600 14px Roboto, Arial, sans-serif; cursor: pointer;
}
#focus-limit button:disabled { opacity: .5; cursor: default; }
`;

export function buildCss(s: Settings): string {
  if (!s.enabled) return '[data-focus-hide]{display:none!important}';
  const f = s.focus;
  const L = s.layout;
  let css = BASE;
  const out: string[] = [];

  if (f.hideShorts) out.push(...SHORTS);
  if (f.hideSidebarRecs) out.push('ytd-watch-flexy #related', 'ytd-watch-next-secondary-results-renderer');
  if (f.hideEndScreen)
    out.push(
      '.ytp-endscreen-content',
      '.videowall-endscreen',
      '.ytp-autonav-endscreen',
      '.ytp-autonav-endscreen-upnext-container',
      '.ytp-fullscreen-grid',
      '.ytp-fullscreen-grid-stills-container',
    );
  if (f.hideEndCards) out.push('.ytp-ce-element', '.ytp-cards-teaser', '.ytp-cards-button', '.iv-branding');
  if (f.hideComments) out.push('ytd-watch-flexy #comments', 'ytd-comments#comments');
  if (f.hideLiveChat) out.push('ytd-watch-flexy #chat-container', 'ytd-live-chat-frame#chat');
  if (f.hideExplore)
    out.push(
      'ytd-guide-section-renderer:has(a[href^="/feed/trending"])',
      'ytd-guide-section-renderer:has(a[href^="/feed/explore"])',
      'ytd-guide-section-renderer:has(a[href^="/gaming"])',
      'ytd-guide-section-renderer:has(a[href^="/premium"])',
      'ytd-guide-section-renderer:has(a[href^="/feed/storefront"])',
      'ytd-guide-section-renderer:has(a[href="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"])',
      'ytd-guide-section-renderer:has(a[href="/channel/UC4R8DWoMoI7CAwX8_LjQHig"])',
      'ytd-guide-entry-renderer:has(a[href^="/feed/trending"])',
      'ytd-mini-guide-entry-renderer:has(a[href^="/feed/explore"])',
    );
  if (f.hideNotifications) out.push('ytd-notification-topbar-button-renderer');
  if (f.hideMixes)
    out.push(
      'ytd-radio-renderer',
      'ytd-compact-radio-renderer',
      'ytd-rich-item-renderer:has(a[href*="start_radio=1"])',
      'yt-lockup-view-model:has(a[href*="start_radio=1"])',
    );
  if (f.hidePlayables)
    out.push(
      'ytd-rich-section-renderer:has(a[href^="/playables"])',
      'ytd-rich-item-renderer:has(a[href^="/playables"])',
      'ytd-guide-entry-renderer:has(a[href^="/playables"])',
    );
  if (f.hideSearchClutter)
    out.push('ytd-search ytd-shelf-renderer', 'ytd-search ytd-horizontal-card-list-renderer', 'ytd-search grid-shelf-view-model');
  if (f.homeMode !== 'normal') out.push('ytd-browse[page-subtype="home"] ytd-rich-section-renderer');
  // Allowlist home: cards stay hidden until the filter approves them, so rejected ones never flash.
  if (f.homeMode === 'allowlist' && !allowlistEmpty(s))
    out.push('html[focus-page="home"] ytd-browse[page-subtype="home"] ytd-rich-item-renderer:not([data-focus-ok])');
  // Hidden / custom home: our own #focus-home replaces YouTube's feed.
  out.push(
    'html[focus-home-replaced] ytd-browse[page-subtype="home"] ytd-rich-grid-renderer',
    'html[focus-home-replaced] ytd-browse[page-subtype="home"] #header.ytd-rich-grid-renderer',
    'html[focus-home-replaced] ytd-browse[page-subtype="home"] ytd-feed-filter-chip-bar-renderer',
  );

  if (s.ads.enabled && s.ads.cosmetic) out.push(...ADS);
  if (s.ads.enabled && s.ads.antiAdblock) {
    out.push('ytd-enforcement-message-view-model', 'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)');
    css += 'body:has(ytd-enforcement-message-view-model) tp-yt-iron-overlay-backdrop { display: none !important; }\n';
  }

  if (L.hideClip) out.push(buttonByLabel('Clip'));
  if (L.hideThanks) out.push(buttonByLabel('Thanks'));
  if (L.hideDownload) out.push('ytd-download-button-renderer', buttonByLabel('Download'));
  if (L.hideJoin) out.push('ytd-watch-metadata #sponsor-button', '#sponsor-button');
  if (L.hideShop) out.push(buttonByLabel('Shop'), buttonByLabel('Shopping'));
  if (L.hideRemix) out.push(buttonByLabel('Remix'));
  if (L.hideAmbient) out.push('#cinematics', '#cinematics-container');

  css += hide(out);

  if (L.gridColumns > 0) {
    css += `ytd-rich-grid-renderer {
  --ytd-rich-grid-items-per-row: ${L.gridColumns} !important;
  --ytd-rich-grid-posts-per-row: ${L.gridColumns} !important;
  --ytd-rich-grid-slim-items-per-row: ${L.gridColumns + 1} !important;
}\n`;
  }
  const cards = ':is(ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model)';
  if (L.thumbnails === 'grayscale') css += `:is(${THUMBS}) { filter: grayscale(1); }\n`;
  if (L.thumbnails === 'blur') css += `:is(${THUMBS}) { filter: blur(14px); transition: filter .2s; }\n${cards}:hover :is(${THUMBS}) { filter: none; }\n`;
  if (L.thumbnails === 'hidden') css += hide(['ytd-thumbnail', 'yt-thumbnail-view-model', '.yt-lockup-view-model__content-image']);

  return css;
}
