# FOCUS

A Chromium extension that makes YouTube calm, plus a Pomodoro timer and per-site screen time.

## Install (Chrome, Edge, Brave, Arc…)

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick `.output/chrome-mv3`.
3. Pin FOCUS to the toolbar. The settings page opens on first install.

After code changes, run `npm run build` and press the reload icon on the extension card
(or use `npm run dev` for a browser with hot reload).

## What it does

**Focus**: hides Shorts everywhere (and opens `/shorts/` links in the normal player), sidebar
recommendations, end screens, autoplay, Mixes, Explore, Playables, comments/live chat (optional).

**Homepage**: one of
- *Allowlist only*: YouTube's feed, filtered to channels, categories or keywords you allow
- *My channels feed*: latest uploads from allowed channels (no API key needed)
- *Hidden*: a calm page with links to Subscriptions, Watch later and History
- *Normal*: YouTube's feed minus your blocklist

Blocklist (channels, keywords, categories, length, watched, members-only) applies on home, search and the sidebar.

**Categories** need a free YouTube Data API key (Settings → YouTube API has step-by-step instructions).

**Player**: default and per-channel speed up to 16×, `D`/`S`/`R` = faster/slower/reset,
mouse-wheel volume, volume boost up to 600%, default quality, force H.264, original audio
track, theater mode, auto transcript, pause on tab switch, resume position, and extra player
buttons (speed, loop, A-B loop, screenshot, picture-in-picture, cinema).

**Ads**: network blocking, removing ad data before the player sees it, auto-skip fallback,
hiding ad boxes, and dismissing the anti-adblock dialog. Each layer can be switched off.

**Community**: SponsorBlock auto-skip (with Undo and progress-bar marks), Return YouTube
Dislike counts, DeArrow titles/thumbnails, original (untranslated) titles.

**Limits**: Deep Focus on a schedule or during Pomodoro sessions, a daily YouTube limit,
and a countdown before you can loosen focus settings.

**Pomodoro**: in the popup. Runs in the background, notifies at the end of each phase,
long break every N sessions. Badge turns red during focus, green during breaks.

**Screen time**: time per website (active tab of the focused window; pauses when idle unless
audio is playing). The toolbar badge shows time on the current site over the last 24 hours.
Full report with 24h / today / 7-day views in Settings → Screen time.

## Development

```bash
npm run typecheck   # TypeScript
npm test            # unit tests (vitest)
npm run build       # production build -> .output/chrome-mv3
```

Layout:
- `entrypoints/background/`: screen time, badge, Pomodoro, ad rules, API lookups
- `entrypoints/yt-main.content/`: runs in YouTube's page (ad removal, player control)
- `entrypoints/yt.content/`: page features (styles, filtering, home, buttons, SponsorBlock…)
- `entrypoints/popup/`, `entrypoints/options/`: UI
- `lib/`: shared settings, filtering logic, formatting
- `entrypoints/yt.content/selectors.ts`: every YouTube selector; fix here when YouTube changes its markup

## Known limits

- YouTube changes its page structure and ad delivery often; expect occasional selector fixes.
- Ads stitched directly into the video stream can't be removed, only skipped/muted when detected.
- Volume boost starts after your first click on the page (browser autoplay rule).
- Settings are stored locally on this device (use Backup → Export to move them).
