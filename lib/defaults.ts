// Settings shape, defaults and presets. Pure module: safe to import from any context (MAIN world included).

export interface ChannelRef {
  id?: string; // UC... channel id
  handle?: string; // @handle (lowercase, with @)
  name: string;
}

export type HomeMode = 'normal' | 'allowlist' | 'custom' | 'hidden';
export type ThumbStyle = 'normal' | 'grayscale' | 'blur' | 'hidden';
export type Quality = 'auto' | 'highest' | 'hd2160' | 'hd1440' | 'hd1080' | 'hd720' | 'large' | 'medium' | 'small';

export const SB_CATEGORIES = [
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
  'preview',
  'music_offtopic',
  'filler',
] as const;
export type SbCategory = (typeof SB_CATEGORIES)[number];

export interface Settings {
  enabled: boolean;
  focus: {
    hideShorts: boolean;
    redirectShorts: boolean;
    homeMode: HomeMode;
    hideSidebarRecs: boolean;
    hideEndScreen: boolean;
    hideEndCards: boolean;
    disableAutoplay: boolean;
    hideComments: boolean;
    hideLiveChat: boolean;
    hideExplore: boolean;
    hideNotifications: boolean;
    hideMixes: boolean;
    hidePlayables: boolean;
    hideSearchClutter: boolean;
    hideMembersOnly: boolean;
    hideWatched: boolean;
    watchedThreshold: number; // percent
  };
  allow: { channels: ChannelRef[]; categories: string[]; keywords: string[] };
  block: {
    channels: ChannelRef[];
    categories: string[];
    keywords: string[];
    minMinutes: number; // 0 = off
    maxMinutes: number; // 0 = off
  };
  player: {
    defaultSpeed: number;
    speedStep: number;
    rememberSpeed: boolean;
    musicNormalSpeed: boolean;
    channelSpeeds: Record<string, number>; // channel id -> speed
    channelSpeedNames: Record<string, string>; // channel id -> display name
    shortcuts: boolean;
    keyFaster: string;
    keySlower: string;
    keyReset: string;
    wheelVolume: boolean;
    wheelStep: number;
    volumeBoost: number; // 1 = 100%
    wheelBoost: boolean;
    disableLoudnessNorm: boolean;
    defaultQuality: Quality;
    forceH264: boolean;
    originalAudio: boolean;
    autoTheater: boolean;
    autoTranscript: boolean;
    pauseOnHide: boolean;
    resumePlayback: boolean;
    controls: boolean;
  };
  ads: { enabled: boolean; network: boolean; prune: boolean; autoSkip: boolean; cosmetic: boolean; antiAdblock: boolean };
  community: {
    sponsorblock: boolean;
    sbCategories: Record<SbCategory, boolean>;
    sbShowBar: boolean;
    dislikes: boolean;
    dearrowTitles: boolean;
    dearrowThumbs: boolean;
    originalTitles: boolean;
  };
  layout: {
    gridColumns: number; // 0 = YouTube default
    thumbnails: ThumbStyle;
    hideClip: boolean;
    hideThanks: boolean;
    hideDownload: boolean;
    hideJoin: boolean;
    hideShop: boolean;
    hideRemix: boolean;
    hideAmbient: boolean;
  };
  limits: {
    scheduleEnabled: boolean;
    scheduleDays: number[]; // 0 = Sunday
    scheduleStart: string; // HH:MM
    scheduleEnd: string;
    dailyMinutes: number; // 0 = off
    friction: boolean;
    frictionSeconds: number;
  };
  pomodoro: {
    work: number;
    short: number;
    long: number;
    longEvery: number;
    autoStartBreaks: boolean;
    autoStartWork: boolean;
    notify: boolean;
    deepFocusDuringWork: boolean;
  };
  api: { youtubeKey: string; region: string };
  screentime: { enabled: boolean; badge: boolean; idleMinutes: number; countAudible: boolean };
}

export const DEFAULTS: Settings = {
  enabled: true,
  focus: {
    hideShorts: true,
    redirectShorts: true,
    homeMode: 'allowlist',
    hideSidebarRecs: true,
    hideEndScreen: true,
    hideEndCards: true,
    disableAutoplay: true,
    hideComments: false,
    hideLiveChat: false,
    hideExplore: true,
    hideNotifications: false,
    hideMixes: true,
    hidePlayables: true,
    hideSearchClutter: true,
    hideMembersOnly: false,
    hideWatched: false,
    watchedThreshold: 90,
  },
  allow: { channels: [], categories: [], keywords: [] },
  block: { channels: [], categories: [], keywords: [], minMinutes: 0, maxMinutes: 0 },
  player: {
    defaultSpeed: 1,
    speedStep: 0.25,
    rememberSpeed: false,
    musicNormalSpeed: true,
    channelSpeeds: {},
    channelSpeedNames: {},
    shortcuts: true,
    keyFaster: 'd',
    keySlower: 's',
    keyReset: 'r',
    wheelVolume: true,
    wheelStep: 5,
    volumeBoost: 1,
    wheelBoost: false,
    disableLoudnessNorm: false,
    defaultQuality: 'auto',
    forceH264: false,
    originalAudio: true,
    autoTheater: false,
    autoTranscript: false,
    pauseOnHide: false,
    resumePlayback: false,
    controls: true,
  },
  ads: { enabled: true, network: true, prune: true, autoSkip: true, cosmetic: true, antiAdblock: true },
  community: {
    sponsorblock: true,
    sbCategories: {
      sponsor: true,
      selfpromo: true,
      interaction: true,
      intro: false,
      outro: false,
      preview: false,
      music_offtopic: true,
      filler: false,
    },
    sbShowBar: true,
    dislikes: true,
    dearrowTitles: false,
    dearrowThumbs: false,
    originalTitles: false,
  },
  layout: {
    gridColumns: 0,
    thumbnails: 'normal',
    hideClip: true,
    hideThanks: true,
    hideDownload: false,
    hideJoin: false,
    hideShop: true,
    hideRemix: true,
    hideAmbient: false,
  },
  limits: {
    scheduleEnabled: false,
    scheduleDays: [1, 2, 3, 4, 5],
    scheduleStart: '09:00',
    scheduleEnd: '17:00',
    dailyMinutes: 0,
    friction: true,
    frictionSeconds: 30,
  },
  pomodoro: {
    work: 25,
    short: 5,
    long: 15,
    longEvery: 4,
    autoStartBreaks: true,
    autoStartWork: false,
    notify: true,
    deepFocusDuringWork: true,
  },
  api: { youtubeKey: '', region: 'IN' },
  screentime: { enabled: true, badge: true, idleMinutes: 5, countAudible: true },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type SettingsPatch = DeepPartial<Settings>;

/** Rules switched on during scheduled focus hours and Pomodoro work sessions. */
export const DEEP_FOCUS: SettingsPatch = {
  enabled: true,
  focus: {
    hideShorts: true,
    redirectShorts: true,
    hideSidebarRecs: true,
    hideEndScreen: true,
    hideEndCards: true,
    disableAutoplay: true,
    hideComments: true,
    hideExplore: true,
    hideMixes: true,
    hidePlayables: true,
    hideSearchClutter: true,
  },
};

export const PRESETS: Record<string, { label: string; description: string; patch: SettingsPatch }> = {
  deep: {
    label: 'Deep Focus',
    description: 'Hide everything except search and your allowlist',
    patch: {
      ...DEEP_FOCUS,
      focus: { ...DEEP_FOCUS.focus, homeMode: 'allowlist', hideLiveChat: true, hideNotifications: true },
      layout: { thumbnails: 'grayscale' },
    },
  },
  balanced: {
    label: 'Balanced',
    description: 'No Shorts or sidebar recommendations, filtered home feed',
    patch: {
      enabled: true,
      focus: {
        hideShorts: true,
        homeMode: 'allowlist',
        hideSidebarRecs: true,
        hideEndScreen: true,
        disableAutoplay: true,
        hideComments: false,
        hideLiveChat: false,
        hideNotifications: false,
      },
      layout: { thumbnails: 'normal' },
    },
  },
  relaxed: {
    label: 'Relaxed',
    description: 'Normal YouTube minus Shorts and ads',
    patch: {
      enabled: true,
      focus: {
        hideShorts: true,
        homeMode: 'normal',
        hideSidebarRecs: false,
        hideEndScreen: false,
        hideEndCards: false,
        disableAutoplay: false,
        hideComments: false,
        hideExplore: false,
        hideMixes: false,
      },
      layout: { thumbnails: 'normal' },
    },
  },
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep-merge `patch` onto `base`. Arrays and primitives replace; unknown keys in patch are kept. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : (patch as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[k];
    out[k] = isPlainObject(b) && isPlainObject(v) ? deepMerge(b, v) : v;
  }
  return out as T;
}

/** Fill in any missing keys from defaults (used when loading stored settings after an upgrade). */
export function withDefaults(stored: unknown): Settings {
  return deepMerge(structuredClone(DEFAULTS), stored ?? {});
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (isPlainObject(o) ? o[k] : undefined), obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root = structuredClone(obj) as Record<string, unknown>;
  let cur = root;
  for (const k of keys.slice(0, -1)) {
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]!] = value;
  return root as T;
}
