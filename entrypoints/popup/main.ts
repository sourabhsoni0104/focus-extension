import '../../lib/ui/ui.css';
import './style.css';
import { deepMerge, PRESETS, type ChannelRef, type HomeMode, type Settings } from '../../lib/defaults';
import { h, replaceChildren } from '../../lib/dom';
import { focusReason } from '../../lib/effective';
import { clock, duration, hostOf } from '../../lib/format';
import { inChannelList } from '../../lib/match';
import { send, type TabMessage } from '../../lib/messages';
import { loadSettings, saveSettings, updatePath, watchSettings } from '../../lib/settings';
import type { PomoState, TabStatus } from '../../lib/types';
import { confirmWithCountdown, guard, siteList, timeChart, toggle } from '../../lib/ui/components';

type Tab = 'youtube' | 'pomodoro' | 'time';
let settings: Settings;
let tab: Tab = 'youtube';
let activeTab: chrome.tabs.Tab | undefined;
let pomoTimer: ReturnType<typeof setInterval> | undefined;

const app = document.getElementById('app')!;
const main = h('main');

async function setPath(path: string, value: unknown): Promise<boolean> {
  if (!(await guard(settings, path, value))) return false;
  settings = await updatePath(path, value);
  return true;
}

function row(label: string, control: Node, hint?: string) {
  return h('div', { class: 'row' }, h('div', { class: 'label' }, h('span', null, label), hint ? h('small', null, hint) : null), control);
}

function switchFor(path: string, label: string, hint?: string) {
  const get = () => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], settings) as boolean;
  return row(label, toggle(get(), async (v, input) => {
    if (!(await setPath(path, v))) input.checked = !v;
  }, label), hint);
}

async function tabMessage<T>(msg: TabMessage): Promise<T | null> {
  if (!activeTab?.id) return null;
  try {
    return (await chrome.tabs.sendMessage(activeTab.id, msg)) as T;
  } catch {
    return null;
  }
}

// ---------------- YouTube tab ----------------

async function channelAction(ch: ChannelRef, list: 'allow' | 'block') {
  let ref = ch;
  if (!ref.id) ref = await send('channel:resolve', { input: ch.handle ?? ch.name }).catch(() => ch);
  const other = list === 'allow' ? 'block' : 'allow';
  const s = structuredClone(settings);
  s[other].channels = s[other].channels.filter((c) => !(c.id && c.id === ref.id) && c.name !== ref.name);
  if (!inChannelList(s[list].channels, ref)) s[list].channels.push(ref);
  await saveSettings(s);
  settings = s;
  void render();
}

function nowPlaying(status: TabStatus): HTMLElement | null {
  const v = status.video;
  const ch = status.channel;
  if (!v && !ch) return null;
  const box = h('div', { class: 'now' });
  if (v) {
    box.append(h('div', { class: 'title', title: v.title ?? '' }, v.title ?? 'Current video'), h('div', { class: 'channel' }, v.author ?? ''));
    const speedOut = h('output', null, `${v.speed}x`);
    const speed = h('input', { type: 'range', min: 0.25, max: 4, step: 0.05, value: String(v.speed), 'aria-label': 'Speed' });
    speed.addEventListener('input', () => {
      speedOut.textContent = `${speed.value}x`;
      void tabMessage({ type: 'tab:speed', value: Number(speed.value) });
    });
    const boostOut = h('output', null, `${Math.round(v.boost * 100)}%`);
    const boost = h('input', { type: 'range', min: 1, max: 6, step: 0.25, value: String(v.boost), 'aria-label': 'Volume boost' });
    boost.addEventListener('input', () => {
      boostOut.textContent = `${Math.round(Number(boost.value) * 100)}%`;
      void tabMessage({ type: 'tab:boost', value: Number(boost.value) });
    });
    box.append(
      h('div', { class: 'slider-row' }, h('span', null, 'Speed'), speed, speedOut),
      h('div', { class: 'slider-row' }, h('span', null, 'Boost'), boost, boostOut),
    );
    if (v.channelId) {
      const id = v.channelId;
      const saved = settings.player.channelSpeeds[id];
      box.append(
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn small',
            onclick: async () => {
              const s = structuredClone(settings);
              s.player.channelSpeeds[id] = Number(speed.value);
              s.player.channelSpeedNames[id] = v.author ?? id;
              await saveSettings(s);
              settings = s;
              void render();
            },
          }, saved ? `Channel speed: ${saved}x · update` : 'Use this speed for this channel'),
          saved
            ? h('button', {
                class: 'btn small ghost',
                onclick: async () => {
                  const s = structuredClone(settings);
                  delete s.player.channelSpeeds[id];
                  delete s.player.channelSpeedNames[id];
                  await saveSettings(s);
                  settings = s;
                  void render();
                },
              }, 'Clear')
            : null,
        ),
      );
    }
  } else if (ch) {
    box.append(h('div', { class: 'title' }, ch.name || ch.handle || 'This channel'));
  }
  if (ch && (ch.id || ch.handle || ch.name)) {
    const allowed = inChannelList(settings.allow.channels, ch);
    const blocked = inChannelList(settings.block.channels, ch);
    box.append(
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', disabled: allowed, onclick: () => void channelAction(ch, 'allow') }, allowed ? '✓ Allowed on home' : 'Allow channel on home'),
        h('button', { class: 'btn small danger', disabled: blocked, onclick: () => void channelAction(ch, 'block') }, blocked ? 'Blocked' : 'Block channel'),
      ),
    );
  }
  return box;
}

async function renderYoutube(sec: HTMLElement) {
  const isYt = hostOf(activeTab?.url) === 'youtube.com';
  const status = isYt ? await tabMessage<TabStatus>({ type: 'tab:status' }) : null;
  const pomo = await send('pomo:get', {}).catch(() => undefined);
  const r = focusReason(settings, pomo);

  const presets = h('div', { class: 'presets' },
    Object.entries(PRESETS).map(([key, p]) =>
      h('button', {
        class: 'btn',
        title: p.description,
        onclick: async () => {
          const next = deepMerge(settings, p.patch);
          const loosens = key === 'relaxed' || (settings.focus.homeMode !== 'normal' && next.focus.homeMode === 'normal');
          if (loosens && settings.limits.friction && !(await confirmWithCountdown('Switch to Relaxed?', 'This shows recommendations again.', settings.limits.frictionSeconds))) return;
          await saveSettings(next);
          settings = next;
          void render();
        },
      }, p.label),
    ),
  );

  const homeSelect = h('select', { 'aria-label': 'Homepage' },
    ([['allowlist', 'Allowlist only'], ['custom', 'My channels feed'], ['hidden', 'Hidden'], ['normal', 'Normal']] as [HomeMode, string][]).map(([v, l]) =>
      h('option', { value: v, selected: settings.focus.homeMode === v }, l),
    ),
  );
  homeSelect.addEventListener('change', async () => {
    if (!(await setPath('focus.homeMode', homeSelect.value))) homeSelect.value = settings.focus.homeMode;
  });

  replaceChildren(
    sec,
    r.pomodoro || r.schedule ? h('div', { style: { marginBottom: '8px' } }, h('span', { class: 'pill' }, r.pomodoro ? '● Deep Focus: Pomodoro session' : '● Deep Focus: scheduled hours')) : null,
    status ? nowPlaying(status) : null,
    h('h2', null, 'Presets'),
    presets,
    h('h2', null, 'Quick settings'),
    row('Homepage', homeSelect),
    switchFor('focus.hideShorts', 'Hide Shorts'),
    switchFor('focus.hideSidebarRecs', 'Hide recommendations', 'Sidebar next to videos'),
    switchFor('focus.hideEndScreen', 'Hide end screen'),
    switchFor('focus.hideComments', 'Hide comments'),
    switchFor('ads.enabled', 'Block ads'),
    switchFor('community.sponsorblock', 'Skip sponsors', 'SponsorBlock'),
  );
}

// ---------------- Pomodoro tab ----------------

const PHASE_LABEL: Record<PomoState['phase'], string> = { work: 'Focus', short: 'Short break', long: 'Long break' };

function renderPomo(sec: HTMLElement, p: PomoState) {
  const total = (p.phase === 'work' ? settings.pomodoro.work : p.phase === 'short' ? settings.pomodoro.short : settings.pomodoro.long) * 60000;
  const left = p.status === 'running' ? p.endsAt - Date.now() : p.remaining;
  const R = 84;
  const C = 2 * Math.PI * R;
  const frac = Math.min(1, Math.max(0, left / total));
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(svgNS, 'svg');
  svgEl.setAttribute('width', '190');
  svgEl.setAttribute('height', '190');
  for (const cls of ['track', 'bar']) {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', '95');
    c.setAttribute('cy', '95');
    c.setAttribute('r', String(R));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '10');
    c.setAttribute('class', cls);
    if (cls === 'bar') {
      c.setAttribute('stroke-linecap', 'round');
      c.setAttribute('stroke-dasharray', String(C));
      c.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
    }
    svgEl.appendChild(c);
  }
  const act = (action: 'start' | 'pause' | 'reset' | 'skip') => async () => {
    const next = await send('pomo:action', { action });
    renderPomo(sec, next);
  };
  const every = Math.max(1, settings.pomodoro.longEvery);
  const doneInCycle = p.completed % every === 0 && p.completed > 0 && p.phase === 'long' ? every : p.completed % every;
  replaceChildren(
    sec,
    h('div', { class: 'pomo' },
      h('div', { class: `ring ${p.phase === 'work' ? '' : 'break'}` }, svgEl,
        h('div', { class: 'center' }, h('div', { class: 'time' }, clock(left)), h('div', { class: 'phase' }, PHASE_LABEL[p.phase]))),
      h('div', { class: 'dots', 'aria-label': `${doneInCycle} of ${every} sessions done` },
        Array.from({ length: every }, (_, i) => h('span', { class: i < doneInCycle ? 'done' : '' }))),
      h('div', { class: 'controls' },
        p.status === 'running'
          ? h('button', { class: 'btn primary', onclick: act('pause') }, 'Pause')
          : h('button', { class: 'btn primary', onclick: act('start') }, p.status === 'paused' ? 'Resume' : 'Start'),
        h('button', { class: 'btn', onclick: act('skip') }, 'Skip'),
        h('button', { class: 'btn ghost', onclick: act('reset') }, 'Reset'),
      ),
      h('div', { class: 'meta' },
        `${settings.pomodoro.work}m focus · ${settings.pomodoro.short}m break · ${settings.pomodoro.long}m long break every ${every}`,
        h('br'),
        `${p.completed} session${p.completed === 1 ? '' : 's'} completed`,
        settings.pomodoro.deepFocusDuringWork ? ' · YouTube Deep Focus during sessions' : '',
      ),
    ),
  );
}

async function renderPomodoro(sec: HTMLElement) {
  const tick = async () => {
    if (tab !== 'pomodoro') return clearInterval(pomoTimer);
    renderPomo(sec, await send('pomo:get', {}));
  };
  await tick();
  clearInterval(pomoTimer);
  pomoTimer = setInterval(tick, 1000);
}

// ---------------- Screen time tab ----------------

async function renderTime(sec: HTMLElement) {
  const sum = await send('st:summary', { range: '24h' });
  const domain = hostOf(activeTab?.url);
  const here = domain ? sum.domains.find((d) => d.domain === domain) : undefined;
  replaceChildren(
    sec,
    h('div', { class: 'st-head' },
      h('div', null, h('div', { class: 'st-total' }, duration(sum.total)), h('div', { class: 'muted' }, 'in the last 24 hours')),
      domain ? h('div', { class: 'muted', style: { textAlign: 'right', fontSize: '13px' } }, domain, h('br'), h('strong', null, duration(here?.ms ?? 0))) : null,
    ),
    timeChart(sum, 90),
    h('h2', null, 'Top sites'),
    siteList(sum, 8),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => void send('ui:openOptions', { hash: 'screentime' }) }, 'Full report')),
  );
}

// ---------------- shell ----------------

async function render() {
  const sec = h('section');
  const nav = h('nav', { role: 'tablist' },
    ([['youtube', 'YouTube'], ['pomodoro', 'Pomodoro'], ['time', 'Screen time']] as [Tab, string][]).map(([t, label]) =>
      h('button', {
        role: 'tab',
        'aria-selected': String(tab === t),
        onclick: () => {
          tab = t;
          try {
            localStorage.setItem('popup_tab', t);
          } catch {
            /* ignore */
          }
          void render();
        },
      }, label),
    ),
  );
  const master = toggle(settings.enabled, async (v, input) => {
    if (!(await setPath('enabled', v))) input.checked = !v;
    else void render();
  }, 'FOCUS enabled');
  replaceChildren(
    app,
    h('header', null, h('img', { src: '/icon/48.png', alt: '' }), h('h1', null, 'FOCUS'), h('span', { class: 'muted', style: { fontSize: '12px' } }, settings.enabled ? 'On' : 'Paused'), master),
    nav,
    main,
    h('footer', null,
      h('button', { class: 'btn ghost small', onclick: () => chrome.runtime.openOptionsPage() }, 'All settings'),
      h('span', { class: 'faint', style: { fontSize: '12px', alignSelf: 'center' } }, 'D / S / R = faster / slower / reset'),
    ),
  );
  replaceChildren(main, sec);
  if (tab === 'youtube') await renderYoutube(sec);
  else if (tab === 'pomodoro') await renderPomodoro(sec);
  else await renderTime(sec);
}

async function init() {
  settings = await loadSettings();
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    tab = (localStorage.getItem('popup_tab') as Tab | null) ?? 'youtube';
  } catch {
    /* ignore */
  }
  watchSettings((s) => (settings = s));
  await render();
}

void init();
