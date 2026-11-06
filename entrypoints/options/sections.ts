// The settings page layout: sections -> groups -> fields.
import { deepMerge, PRESETS, SB_CATEGORIES, type Settings } from '../../lib/defaults';
import { h, replaceChildren } from '../../lib/dom';
import { send } from '../../lib/messages';
import { applyPatch, loadSettings, resetSettings, saveSettings } from '../../lib/settings';
import { confirmWithCountdown } from '../../lib/ui/components';
import type { Bound, Field, FormApi } from './form';
import { screentimeReport } from './screentime-report';

export interface Section {
  id: string;
  title: string;
  intro?: string;
  groups: { title?: string; fields: Field[] }[];
}

const SB_LABELS: Record<string, string> = {
  sponsor: 'Sponsors',
  selfpromo: 'Self-promotion',
  interaction: 'Like / subscribe reminders',
  intro: 'Intros',
  outro: 'Outros / end cards',
  preview: 'Previews / recaps',
  music_offtopic: 'Non-music parts of music videos',
  filler: 'Filler / tangents',
};

const presetsField: Field = {
  kind: 'custom',
  render: (api) => ({
    el: h('div', { class: 'preset-grid' },
      Object.entries(PRESETS).map(([key, p]) =>
        h('button', {
          class: 'preset',
          onclick: async () => {
            const s = api.get();
            if (key === 'relaxed' && s.limits.friction && !(await confirmWithCountdown('Switch to Relaxed?', 'This brings recommendations back.', s.limits.frictionSeconds))) return;
            await applyPatch(p.patch);
          },
        }, h('strong', null, p.label), h('span', null, p.description)),
      ),
    ),
  }),
};

const channelSpeedsField: Field = {
  kind: 'custom',
  render: (api): Bound => {
    const list = h('div', { class: 'chips' });
    const draw = (s: Settings) => {
      const entries = Object.entries(s.player.channelSpeeds);
      replaceChildren(list, entries.length ? entries.map(([id, sp]) =>
        h('span', { class: 'chip' },
          `${s.player.channelSpeedNames[id] ?? id}: ${sp}x`,
          h('button', {
            'aria-label': 'Remove',
            onclick: async () => {
              const next = structuredClone(api.get());
              delete next.player.channelSpeeds[id];
              delete next.player.channelSpeedNames[id];
              await saveSettings(next);
            },
          }, '×'),
        ),
      ) : h('span', { class: 'faint' }, 'None yet. Set one from the popup while watching a video.'));
    };
    draw(api.get());
    return {
      el: h('div', { class: 'block' }, h('div', { class: 'label' }, h('span', null, 'Per-channel speeds'), h('small', null, 'These override the default speed.')), list),
      sync: draw,
    };
  },
};

const apiKeyField: Field = {
  kind: 'custom',
  render: (api): Bound => {
    const input = h('input', { type: 'password', placeholder: 'AIza…', value: api.get().api.youtubeKey, style: { width: '300px' }, 'aria-label': 'API key' });
    const status = h('small', { class: 'muted' });
    const save = h('button', { class: 'btn' }, 'Save & test');
    save.addEventListener('click', async () => {
      const key = input.value.trim();
      status.textContent = 'Testing…';
      const r = await send('yt:testKey', { key }).catch((e: Error) => ({ ok: false, error: e.message }));
      if (r.ok || !key) {
        await api.set('api.youtubeKey', key);
        status.textContent = key ? '✓ Key works and is saved.' : 'Key removed.';
      } else status.textContent = `✗ ${r.error ?? 'Key rejected'}`;
    });
    return {
      el: h('div', { class: 'block' },
        h('div', { class: 'label' }, h('span', null, 'YouTube Data API key'), h('small', null, 'Optional. Speeds up category filtering and enables original titles and channel lookups. Stored on this device.')),
        h('div', { class: 'add' }, input, save),
        status,
        h('ol', { class: 'steps' },
          h('li', null, 'Open ', h('a', { href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', target: '_blank' }, 'YouTube Data API v3'), ' in Google Cloud Console and click Enable (create a project if asked).'),
          h('li', null, 'Go to ', h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank' }, 'Credentials'), ' → Create credentials → API key.'),
          h('li', null, 'Optional: restrict the key to "YouTube Data API v3". Paste it above.'),
          h('li', null, 'The free quota (10,000 units/day) is plenty: one lookup covers 50 videos and costs 1 unit.'),
        ),
      ),
      sync: (s) => document.activeElement !== input && (input.value = s.api.youtubeKey),
    };
  },
};

const backupField: Field = {
  kind: 'custom',
  render: (): Bound => {
    const file = h('input', { type: 'file', accept: 'application/json', hidden: true });
    const status = h('small', { class: 'muted' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text()) as Partial<Settings>;
        await saveSettings(deepMerge(await loadSettings(), data));
        status.textContent = '✓ Settings imported.';
      } catch {
        status.textContent = '✗ That file is not a FOCUS settings export.';
      }
      file.value = '';
    });
    return {
      el: h('div', { class: 'block' },
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn',
            onclick: async () => {
              const blob = new Blob([JSON.stringify(await loadSettings(), null, 2)], { type: 'application/json' });
              const a = h('a', { href: URL.createObjectURL(blob), download: `focus-settings-${new Date().toISOString().slice(0, 10)}.json` });
              a.click();
            },
          }, 'Export settings'),
          h('button', { class: 'btn', onclick: () => file.click() }, 'Import settings'),
          h('button', {
            class: 'btn danger',
            onclick: async () => {
              if (confirm('Reset all FOCUS settings to defaults? Screen-time data is kept.')) {
                await resetSettings();
                status.textContent = 'Settings reset.';
              }
            },
          }, 'Reset to defaults'),
        ),
        file,
        status,
      ),
    };
  },
};

const reportField: Field = { kind: 'custom', render: (api: FormApi) => screentimeReport(api) };

export const SECTIONS: Section[] = [
  {
    id: 'focus',
    title: 'Focus',
    intro: 'Remove the parts of YouTube built to keep you watching.',
    groups: [
      { title: 'Presets', fields: [presetsField] },
      {
        title: 'Shorts',
        fields: [
          { kind: 'toggle', path: 'focus.hideShorts', label: 'Hide Shorts everywhere', hint: 'Home, sidebar, search, subscriptions, channel tabs' },
          { kind: 'toggle', path: 'focus.redirectShorts', label: 'Open Shorts in the normal player', hint: 'Links to /shorts/ play as regular videos' },
        ],
      },
      {
        title: 'Recommendations',
        fields: [
          { kind: 'toggle', path: 'focus.hideSidebarRecs', label: 'Hide sidebar recommendations', hint: 'Playlists you are watching stay visible' },
          { kind: 'toggle', path: 'focus.hideEndScreen', label: 'Hide end-screen video wall and "Next" button' },
          { kind: 'toggle', path: 'focus.hideEndCards', label: 'Hide end cards and info cards' },
          { kind: 'toggle', path: 'focus.disableAutoplay', label: 'Turn autoplay off' },
          { kind: 'toggle', path: 'focus.hideMixes', label: 'Hide Mixes' },
          { kind: 'toggle', path: 'focus.hideExplore', label: 'Hide Explore / Trending / "More from YouTube"' },
          { kind: 'toggle', path: 'focus.hidePlayables', label: 'Hide Playables (games)' },
          { kind: 'toggle', path: 'focus.hideSearchClutter', label: 'Hide extra shelves in search', hint: '"People also watched", "For you"…' },
        ],
      },
      {
        title: 'Other distractions',
        fields: [
          { kind: 'toggle', path: 'focus.hideComments', label: 'Hide comments' },
          { kind: 'toggle', path: 'focus.hideLiveChat', label: 'Hide live chat' },
          { kind: 'toggle', path: 'focus.hideNotifications', label: 'Hide notification bell' },
        ],
      },
    ],
  },
  {
    id: 'home',
    title: 'Homepage & filters',
    intro: 'Choose what can appear on your homepage, and what never appears anywhere.',
    groups: [
      {
        fields: [
          {
            kind: 'select',
            path: 'focus.homeMode',
            label: 'Homepage',
            hint: 'Allowlist filters YouTube’s feed. My channels feed shows the latest uploads from allowed channels.',
            options: [['allowlist', 'Allowlist only'], ['custom', 'My channels feed'], ['hidden', 'Hidden'], ['normal', 'Normal (blocklist only)']],
          },
        ],
      },
      {
        title: 'Allow on homepage',
        fields: [
          { kind: 'channels', path: 'allow.channels', label: 'Channels' },
          { kind: 'categories', path: 'allow.categories', label: 'Categories', hint: 'Videos in these categories are allowed (uses each video’s own category, e.g. Music or Education).' },
          { kind: 'keywords', path: 'allow.keywords', label: 'Keywords', hint: 'Videos whose title or channel contains any of these are allowed.' },
        ],
      },
      {
        title: 'Block everywhere',
        fields: [
          { kind: 'channels', path: 'block.channels', label: 'Channels', hint: 'Hidden from home, search and sidebar (not from your subscriptions).' },
          { kind: 'categories', path: 'block.categories', label: 'Categories' },
          { kind: 'keywords', path: 'block.keywords', label: 'Keywords' },
          { kind: 'number', path: 'block.minMinutes', label: 'Hide videos shorter than', min: 0, max: 600, suffix: 'min', hint: '0 = off' },
          { kind: 'number', path: 'block.maxMinutes', label: 'Hide videos longer than', min: 0, max: 6000, suffix: 'min', hint: '0 = off' },
          { kind: 'toggle', path: 'focus.hideMembersOnly', label: 'Hide members-only videos' },
          { kind: 'toggle', path: 'focus.hideWatched', label: 'Hide videos you have watched' },
          { kind: 'number', path: 'focus.watchedThreshold', label: 'Counts as watched after', min: 1, max: 100, suffix: '%' },
        ],
      },
    ],
  },
  {
    id: 'player',
    title: 'Player',
    groups: [
      {
        title: 'Speed',
        fields: [
          { kind: 'number', path: 'player.defaultSpeed', label: 'Default speed', min: 0.1, max: 16, step: 0.05, suffix: '×' },
          { kind: 'number', path: 'player.speedStep', label: 'Shortcut step', min: 0.05, max: 1, step: 0.05, suffix: '×' },
          { kind: 'toggle', path: 'player.rememberSpeed', label: 'Remember the last speed I set', hint: 'Shortcut changes become the new default' },
          { kind: 'toggle', path: 'player.musicNormalSpeed', label: 'Play music at 1×', hint: 'Videos in the Music category' },
          channelSpeedsField,
        ],
      },
      {
        title: 'Keyboard',
        fields: [
          { kind: 'toggle', path: 'player.shortcuts', label: 'Speed shortcuts' },
          { kind: 'text', path: 'player.keyFaster', label: 'Faster key', placeholder: 'd' },
          { kind: 'text', path: 'player.keySlower', label: 'Slower key', placeholder: 's' },
          { kind: 'text', path: 'player.keyReset', label: 'Reset / toggle key', placeholder: 'r' },
        ],
      },
      {
        title: 'Volume',
        fields: [
          { kind: 'toggle', path: 'player.wheelVolume', label: 'Mouse wheel over the player changes volume' },
          { kind: 'number', path: 'player.wheelStep', label: 'Wheel step', min: 1, max: 25, suffix: '%' },
          {
            kind: 'select',
            path: 'player.volumeBoost',
            label: 'Default volume boost',
            number: true,
            hint: 'Applies after your first click on the page (browser rule)',
            options: [['1', 'Off (100%)'], ['1.5', '150%'], ['2', '200%'], ['3', '300%'], ['4', '400%'], ['6', '600%']],
          },
          { kind: 'toggle', path: 'player.wheelBoost', label: 'Wheel past 100% boosts volume' },
          { kind: 'toggle', path: 'player.disableLoudnessNorm', label: 'Turn off loudness normalization', hint: 'Keep loud videos at your chosen volume' },
        ],
      },
      {
        title: 'Video',
        fields: [
          {
            kind: 'select',
            path: 'player.defaultQuality',
            label: 'Default quality',
            options: [['auto', 'Auto'], ['highest', 'Highest available'], ['hd2160', '2160p'], ['hd1440', '1440p'], ['hd1080', '1080p'], ['hd720', '720p'], ['large', '480p'], ['medium', '360p'], ['small', '240p']],
          },
          { kind: 'toggle', path: 'player.forceH264', label: 'Force H.264', hint: 'Easier on battery and CPU; usually caps at 1080p. Reload YouTube after changing.' },
          { kind: 'toggle', path: 'player.originalAudio', label: 'Prefer original audio over auto-dubbed tracks' },
          { kind: 'toggle', path: 'player.autoTheater', label: 'Open videos in theater mode' },
          { kind: 'toggle', path: 'player.autoTranscript', label: 'Open the transcript automatically' },
          { kind: 'toggle', path: 'player.pauseOnHide', label: 'Pause when I switch tabs', hint: 'Not while in picture-in-picture' },
          { kind: 'toggle', path: 'player.resumePlayback', label: 'Resume long videos where I left off' },
          { kind: 'toggle', path: 'player.controls', label: 'Extra player buttons', hint: 'Speed, loop, A-B loop, screenshot, picture-in-picture, cinema' },
        ],
      },
    ],
  },
  {
    id: 'ads',
    title: 'Ad blocking',
    intro: 'Four layers. If videos misbehave, turn layers off one at a time to find the culprit.',
    groups: [
      {
        fields: [
          { kind: 'toggle', path: 'ads.enabled', label: 'Block ads on YouTube' },
          { kind: 'toggle', path: 'ads.network', label: 'Block ad and tracking requests', hint: 'doubleclick, ad stats, ad SDKs' },
          { kind: 'toggle', path: 'ads.prune', label: 'Remove ads from video data', hint: 'Stops ads before the player sees them' },
          { kind: 'toggle', path: 'ads.autoSkip', label: 'Skip any ad that still plays', hint: 'Mutes, fast-forwards and clicks Skip' },
          { kind: 'toggle', path: 'ads.cosmetic', label: 'Hide ad boxes, promos and merch shelves' },
          { kind: 'toggle', path: 'ads.antiAdblock', label: 'Dismiss the "ad blockers not allowed" dialog' },
        ],
      },
    ],
  },
  {
    id: 'community',
    title: 'SponsorBlock & more',
    intro: 'Free community projects: SponsorBlock, Return YouTube Dislike and DeArrow.',
    groups: [
      {
        title: 'SponsorBlock',
        fields: [
          { kind: 'toggle', path: 'community.sponsorblock', label: 'Skip segments automatically' },
          { kind: 'toggle', path: 'community.sbShowBar', label: 'Show segments on the progress bar' },
          ...SB_CATEGORIES.map((c): Field => ({ kind: 'toggle', path: `community.sbCategories.${c}`, label: SB_LABELS[c] ?? c })),
        ],
      },
      {
        title: 'Titles & ratings',
        fields: [
          { kind: 'toggle', path: 'community.dislikes', label: 'Show dislike counts' },
          { kind: 'toggle', path: 'community.dearrowTitles', label: 'Replace clickbait titles (DeArrow)' },
          { kind: 'toggle', path: 'community.dearrowThumbs', label: 'Replace clickbait thumbnails (DeArrow)' },
          { kind: 'toggle', path: 'community.originalTitles', label: 'Show original titles instead of auto-translated ones', hint: 'Needs an API key' },
        ],
      },
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    groups: [
      {
        fields: [
          { kind: 'select', path: 'layout.gridColumns', label: 'Videos per row', number: true, options: [['0', 'YouTube default'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']] },
          { kind: 'select', path: 'layout.thumbnails', label: 'Thumbnails', options: [['normal', 'Normal'], ['grayscale', 'Black & white'], ['blur', 'Blurred until hover'], ['hidden', 'Hidden']] },
          { kind: 'toggle', path: 'layout.hideAmbient', label: 'Turn off ambient glow behind the player' },
        ],
      },
      {
        title: 'Hide buttons under videos',
        fields: [
          { kind: 'toggle', path: 'layout.hideClip', label: 'Clip' },
          { kind: 'toggle', path: 'layout.hideThanks', label: 'Thanks' },
          { kind: 'toggle', path: 'layout.hideDownload', label: 'Download' },
          { kind: 'toggle', path: 'layout.hideJoin', label: 'Join' },
          { kind: 'toggle', path: 'layout.hideShop', label: 'Shop' },
          { kind: 'toggle', path: 'layout.hideRemix', label: 'Remix' },
        ],
      },
    ],
  },
  {
    id: 'limits',
    title: 'Limits & schedule',
    groups: [
      {
        title: 'Focus hours',
        fields: [
          { kind: 'toggle', path: 'limits.scheduleEnabled', label: 'Deep Focus on a schedule', hint: 'Shorts, recommendations and comments hidden; home feed curated or hidden' },
          { kind: 'days', path: 'limits.scheduleDays', label: 'Days' },
          { kind: 'time', path: 'limits.scheduleStart', label: 'From' },
          { kind: 'time', path: 'limits.scheduleEnd', label: 'Until' },
        ],
      },
      {
        title: 'Daily limit',
        fields: [{ kind: 'number', path: 'limits.dailyMinutes', label: 'YouTube per day', min: 0, max: 1440, step: 5, suffix: 'min', hint: '0 = no limit. A full-screen reminder appears when you reach it.' }],
      },
      {
        title: 'Friction',
        fields: [
          { kind: 'toggle', path: 'limits.friction', label: 'Make me wait before loosening focus settings' },
          { kind: 'number', path: 'limits.frictionSeconds', label: 'Wait for', min: 5, max: 300, suffix: 's' },
        ],
      },
    ],
  },
  {
    id: 'pomodoro',
    title: 'Pomodoro',
    groups: [
      {
        fields: [
          { kind: 'number', path: 'pomodoro.work', label: 'Focus session', min: 1, max: 180, suffix: 'min' },
          { kind: 'number', path: 'pomodoro.short', label: 'Short break', min: 1, max: 60, suffix: 'min' },
          { kind: 'number', path: 'pomodoro.long', label: 'Long break', min: 1, max: 120, suffix: 'min' },
          { kind: 'number', path: 'pomodoro.longEvery', label: 'Long break after', min: 1, max: 12, suffix: 'sessions' },
          { kind: 'toggle', path: 'pomodoro.autoStartBreaks', label: 'Start breaks automatically' },
          { kind: 'toggle', path: 'pomodoro.autoStartWork', label: 'Start focus sessions automatically' },
          { kind: 'toggle', path: 'pomodoro.notify', label: 'Notify me when a session ends' },
          { kind: 'toggle', path: 'pomodoro.deepFocusDuringWork', label: 'Deep Focus on YouTube during focus sessions' },
        ],
      },
    ],
  },
  {
    id: 'screentime',
    title: 'Screen time',
    groups: [
      { fields: [reportField] },
      {
        title: 'Tracking',
        fields: [
          { kind: 'toggle', path: 'screentime.enabled', label: 'Track time per website' },
          { kind: 'toggle', path: 'screentime.badge', label: 'Show time on this site (last 24h) on the toolbar icon' },
          { kind: 'number', path: 'screentime.idleMinutes', label: 'Stop counting after no activity for', min: 1, max: 60, suffix: 'min' },
          { kind: 'toggle', path: 'screentime.countAudible', label: 'Keep counting while a tab plays audio', hint: 'So watching a video counts even without mouse movement' },
        ],
      },
    ],
  },
  { id: 'api', title: 'YouTube API', groups: [{ fields: [apiKeyField, { kind: 'text', path: 'api.region', label: 'Region for category names', placeholder: 'IN' }] }] },
  { id: 'backup', title: 'Backup', groups: [{ fields: [backupField] }] },
];
