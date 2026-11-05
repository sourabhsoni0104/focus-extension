// Every YouTube DOM selector in one place. When YouTube changes its markup, fix it here.

/** Video cards across home, search, sidebar, subscriptions and channel grids (old + new "lockup" markup). */
export const ITEM = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'yt-lockup-view-model',
].join(',');

export const ITEM_LINK = 'a[href*="/watch?v="], a[href^="/shorts/"]';
export const ITEM_TITLE = [
  '#video-title',
  '.yt-lockup-metadata-view-model__title',
  '.yt-lockup-metadata-view-model-wiz__title',
  'h3 a',
].join(',');
export const ITEM_CHANNEL_LINK = 'a[href^="/@"], a[href^="/channel/"]';
export const ITEM_CHANNEL_NAME = [
  'ytd-channel-name #text',
  '#channel-name #text',
  '.yt-content-metadata-view-model__metadata-row a',
  '.yt-content-metadata-view-model__metadata-row span',
  '.yt-content-metadata-view-model-wiz__metadata-row span',
].join(',');
export const ITEM_DURATION = [
  'ytd-thumbnail-overlay-time-status-renderer #text',
  'ytd-thumbnail-overlay-time-status-renderer .badge-shape-wiz__text',
  '.yt-badge-shape__text',
  '.badge-shape-wiz__text',
  'badge-shape div',
].join(',');
export const ITEM_PROGRESS = [
  'ytd-thumbnail-overlay-resume-playback-renderer #progress',
  '[class*="WatchedProgressBarSegment"]',
  '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
].join(',');
export const ITEM_THUMB_IMG = 'ytd-thumbnail img, yt-thumbnail-view-model img, img.yt-core-image, img#img';

export const THUMBS = [
  'ytd-thumbnail img',
  'yt-thumbnail-view-model img',
  '.yt-lockup-view-model__content-image img',
  'ytd-playlist-thumbnail img',
  'ytd-rich-grid-media img.yt-core-image',
].join(',');

export const PLAYER = '#movie_player';
export const RIGHT_CONTROLS = '#movie_player .ytp-right-controls';
export const PROGRESS_BAR = '#movie_player .ytp-progress-bar';
export const AUTOPLAY_TOGGLE = '.ytp-autonav-toggle-button';
export const SIZE_BUTTON = '.ytp-size-button';
export const TRANSCRIPT_BUTTON = 'ytd-video-description-transcript-section-renderer button';
export const WATCH_TITLE = 'ytd-watch-metadata h1 yt-formatted-string, ytd-watch-metadata #title h1';
export const WATCH_CHANNEL_LINK = 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a';
export const DISLIKE_BUTTON = [
  'ytd-watch-metadata dislike-button-view-model button',
  'ytd-watch-metadata #segmented-dislike-button button',
  'ytd-menu-renderer dislike-button-view-model button',
].join(',');
export const CHANNEL_HEADER_NAME = 'yt-page-header-renderer h1, #page-header h1, ytd-c4-tabbed-header-renderer #channel-name #text';
export const HOME_PRIMARY = 'ytd-browse[page-subtype="home"] ytd-two-column-browse-results-renderer #primary, ytd-browse[page-subtype="home"] #primary';
export const ANTI_ADBLOCK = 'ytd-enforcement-message-view-model';
export const SKIP_CHIP = 'yt-chip-cloud-chip-renderer, ytd-feed-filter-chip-bar-renderer yt-chip-cloud-chip-renderer';

/** Hide the outermost element matching a list, e.g. buttons by aria-label. */
export const buttonByLabel = (label: string) =>
  [
    `yt-button-view-model:has(button[aria-label="${label}"])`,
    `ytd-button-renderer:has(button[aria-label="${label}"])`,
  ].join(',');
