// Screen-off flip clock: a black full-screen page showing the time, the Pomodoro, or a countdown timer.
// Opened from the popup as clock.html#clock, #pomodoro or #timer (optionally #timer=<minutes>).
import './style.css';
import { h, replaceChildren } from '../../lib/dom';
import { clockText, countdownText } from '../../lib/format';
import { send } from '../../lib/messages';
import type { PomoState } from '../../lib/types';

type Mode = 'clock' | 'pomodoro' | 'timer';

// ---------- flip digits ----------

const half = (cls: string, d: string) => h('div', { class: `half ${cls}` }, h('span', null, d));

class FlipDigit {
  readonly el = h('div', { class: 'digit' });
  private value: string;
  private settle?: ReturnType<typeof setTimeout>;

  constructor(v: string) {
    this.value = v;
    replaceChildren(this.el, half('top', v), half('bottom', v));
  }

  set(v: string) {
    if (v === this.value) return;
    const old = this.value;
    this.value = v;
    clearTimeout(this.settle);
    // New top half sits behind the old top flap; the new bottom flap falls over the old bottom half.
    replaceChildren(this.el, half('top', v), half('bottom', old), half('top flap', old), half('bottom flap', v));
    this.settle = setTimeout(() => replaceChildren(this.el, half('top', v), half('bottom', v)), 600);
  }
}

class FlipDisplay {
  readonly el = h('div', { class: 'flip', role: 'timer', 'aria-live': 'off' });
  private slots: (FlipDigit | null)[] = [];
  private pattern = '';

  show(text: string) {
    const pattern = text.replace(/\d/g, '0');
    if (pattern !== this.pattern) {
      this.pattern = pattern;
      this.slots = [...text].map((ch) => (ch === ':' ? null : new FlipDigit(ch)));
      replaceChildren(this.el, this.slots.map((d) => d?.el ?? h('div', { class: 'sep' }, ':')));
      this.fit();
    } else [...text].forEach((ch, i) => this.slots[i]?.set(ch));
    this.el.setAttribute('aria-label', text);
  }

  /** Size the digits so the whole row fits the window. */
  fit() {
    const digits = this.slots.filter(Boolean).length;
    const seps = this.slots.length - digits;
    const widthEm = digits * 0.76 + seps * 0.31;
    // Cards are 1.06em tall; leave room for the label, the time below and the controls.
    this.el.style.fontSize = `${Math.min((window.innerWidth * 0.9) / widthEm, (window.innerHeight * 0.6) / 1.06)}px`;
  }
}

// ---------- state ----------

const PHASE: Record<PomoState['phase'], string> = { work: 'Focus', short: 'Short break', long: 'Long break' };
const hour12 = new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12 ?? false;

const TIMER_KEY = 'focus_timer_minutes';
const MAX_MIN = 600;
const clampMin = (n: number) => Math.min(MAX_MIN, Math.max(1, Math.round(n)));

function savedMinutes(): number {
  try {
    return clampMin(Number(localStorage.getItem(TIMER_KEY)) || 25);
  } catch {
    return 25;
  }
}

function parseHash(): { mode: Mode; minutes: number } {
  const [name, arg] = location.hash.slice(1).split('=');
  const mode: Mode = name === 'pomodoro' || name === 'timer' ? name : 'clock';
  return { mode, minutes: Number(arg) ? clampMin(Number(arg)) : savedMinutes() };
}

let { mode, minutes } = parseHash();
let pomo: PomoState | null = null;
type TimerStatus = 'ready' | 'running' | 'paused' | 'done';
let timer: { status: TimerStatus; endsAt: number; remaining: number } = { status: 'ready', endsAt: 0, remaining: minutes * 60000 };

function resetTimer(start: boolean) {
  const ms = minutes * 60000;
  timer = start ? { status: 'running', endsAt: Date.now() + ms, remaining: ms } : { status: 'ready', endsAt: 0, remaining: ms };
}

/** Change the timer length; a running timer restarts with the new length. */
function setMinutes(n: number) {
  minutes = clampMin(n);
  try {
    localStorage.setItem(TIMER_KEY, String(minutes));
  } catch {
    /* not saved */
  }
  history.replaceState(null, '', '#timer');
  resetTimer(timer.status === 'running');
  drawControls();
  render();
}

function toggleTimer() {
  if (timer.status === 'running') timer = { status: 'paused', endsAt: 0, remaining: Math.max(0, timer.endsAt - Date.now()) };
  else if (timer.status === 'done') resetTimer(true);
  else timer = { status: 'running', endsAt: Date.now() + timer.remaining, remaining: timer.remaining };
  drawControls();
  render();
}

// ---------- page ----------

const display = new FlipDisplay();
const label = h('div', { class: 'label' });
const sub = h('div', { class: 'sub' });
const controls = h('div', { class: 'controls' });
const fsPrompt = h('div', { class: 'fs-prompt' }, 'Click anywhere to hide the browser bars');
const app = document.getElementById('app')!;
replaceChildren(
  app,
  h('main', { class: 'stage' }, label, display.el, sub),
  fsPrompt,
  controls,
  h('div', { class: 'hint' }, 'Space start/pause · F full screen · Esc exit'),
);

function nowSub(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function setLabel(text: string, tone = '') {
  label.textContent = text;
  label.className = `label ${tone}`;
}

function render() {
  const now = Date.now();
  display.el.classList.remove('done');
  if (mode === 'clock') {
    const d = new Date();
    display.show(clockText(d, hour12));
    setLabel(d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }));
    sub.textContent = hour12 ? (d.getHours() < 12 ? 'AM' : 'PM') : '';
  } else if (mode === 'pomodoro') {
    if (!pomo) return;
    const left = pomo.status === 'running' ? pomo.endsAt - now : pomo.remaining;
    display.show(countdownText(left));
    const state = pomo.status === 'paused' ? ' · paused' : pomo.status === 'idle' ? ' · ready' : '';
    setLabel(PHASE[pomo.phase] + state, pomo.phase === 'work' ? 'work' : 'break');
    sub.textContent = nowSub();
  } else {
    let left = timer.status === 'running' ? timer.endsAt - now : timer.remaining;
    if (timer.status === 'running' && left <= 0) {
      timer = { status: 'done', endsAt: 0, remaining: 0 };
      left = 0;
      void timesUp();
      drawControls();
    }
    display.show(countdownText(left));
    display.el.classList.toggle('done', timer.status === 'done');
    const note = timer.status === 'paused' ? ' · paused' : timer.status === 'ready' ? ' · ready' : '';
    setLabel(timer.status === 'done' ? "Time's up" : `Timer · ${minutes} min${note}`);
    sub.textContent = nowSub();
  }
}

async function timesUp() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.32);
    });
  } catch {
    /* no audio */
  }
  try {
    chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('/icon/128.png'), title: "Time's up", message: `Your ${minutes}-minute timer finished.` });
  } catch {
    /* no notification */
  }
}

// ---------- controls ----------

const button = (text: string, onclick: () => void, pressed?: boolean) =>
  h('button', { type: 'button', onclick, 'aria-pressed': pressed === undefined ? undefined : String(pressed) }, text);

function setMode(m: Mode) {
  mode = m;
  history.replaceState(null, '', `#${m}`);
  if (m === 'timer' && timer.status === 'done') resetTimer(false);
  drawControls();
  render();
}

async function pomoAction(action: 'start' | 'pause' | 'reset' | 'skip') {
  pomo = await send('pomo:action', { action });
  drawControls();
  render();
}

let controlsSig = '';

/** Rebuild the bottom bar only when its content changes, so a click is never lost to a rebuild. */
function drawControls() {
  const sig = [mode, pomo?.status, timer.status, minutes, barless].join('|');
  if (sig === controlsSig) return;
  controlsSig = sig;
  const modes = h('div', { class: 'group' },
    button('Clock', () => setMode('clock'), mode === 'clock'),
    button('Pomodoro', () => setMode('pomodoro'), mode === 'pomodoro'),
    button('Timer', () => setMode('timer'), mode === 'timer'),
  );
  let actions: HTMLElement | null = null;
  if (mode === 'pomodoro' && pomo) {
    actions = h('div', { class: 'group' },
      pomo.status === 'running' ? button('Pause', () => void pomoAction('pause')) : button(pomo.status === 'paused' ? 'Resume' : 'Start', () => void pomoAction('start')),
      button('Skip', () => void pomoAction('skip')),
      button('Reset', () => void pomoAction('reset')),
    );
  } else if (mode === 'timer') {
    const input = h('input', { type: 'number', min: 1, max: MAX_MIN, value: String(minutes), 'aria-label': 'Timer minutes' });
    const apply = () => {
      const n = Number(input.value);
      if (Number.isFinite(n) && n >= 1 && clampMin(n) !== minutes) setMinutes(n);
      else input.value = String(minutes);
    };
    input.addEventListener('change', apply);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        apply();
        input.blur();
      }
    });
    const step = (d: number) => button(d > 0 ? `+${d}` : `−${-d}`, () => setMinutes(minutes + d));
    const label = { ready: 'Start', running: 'Pause', paused: 'Resume', done: 'Again' }[timer.status];
    actions = h('div', { class: 'group' },
      step(-5), step(-1), h('label', { class: 'minutes' }, input, 'min'), step(1), step(5),
      button(label, toggleTimer),
      timer.status === 'ready' ? null : button('Restart', () => {
        resetTimer(true);
        drawControls();
      }),
    );
  }
  replaceChildren(
    controls,
    modes,
    actions,
    h('div', { class: 'group' },
      barless ? null : button('Full screen', () => void goFullscreen()),
      button('Exit', () => window.close()),
    ),
  );
}

// ---------- full screen ----------

// The popup opens this page in a popup-type window (no tabs or address bar) and makes it full screen.
// If that didn't happen (or the page was opened as a normal tab), fall back to page full screen,
// which browsers only allow after a click or key press, hence the "click anywhere" prompt.
let barless = false;

async function checkWindow() {
  let win: chrome.windows.Window | null = null;
  try {
    win = await chrome.windows.getCurrent();
  } catch {
    win = null;
  }
  // Trust the window size too: macOS can drop a full-screen request while the state still says 'fullscreen'.
  const coversScreen = window.outerWidth >= screen.width - 1;
  barless = !!document.fullscreenElement || (win?.type === 'popup' && win.state === 'fullscreen' && coversScreen);
  fsPrompt.hidden = barless;
  drawControls();
  display.fit();
  return win;
}

async function goFullscreen() {
  const win = await checkWindow();
  if (barless) return;
  if (win?.type === 'popup' && win.id !== undefined) {
    await chrome.windows.update(win.id, { state: 'fullscreen' }).catch(() => undefined);
  } else {
    await document.documentElement.requestFullscreen().catch(() => undefined);
  }
  setTimeout(() => void checkWindow(), 800);
}

// ---------- wiring ----------

let idleTimer: ReturnType<typeof setTimeout> | undefined;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // Keep the controls up while the minutes field is being edited.
    if (document.activeElement instanceof HTMLInputElement) return wake();
    document.body.classList.add('idle');
  }, 2500);
}
document.addEventListener('mousemove', wake);
document.addEventListener('keydown', (e) => {
  wake();
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'Escape') window.close();
  else if (e.key === 'f' || e.key === 'F') void goFullscreen();
  else if (e.key === ' ') {
    e.preventDefault();
    if (mode === 'timer') toggleTimer();
    else if (mode === 'pomodoro' && pomo) void pomoAction(pomo.status === 'running' ? 'pause' : 'start');
  }
});
// Clicking the clock itself goes full screen if the window isn't already.
document.querySelector('.stage')?.addEventListener('click', () => void goFullscreen());
document.addEventListener('fullscreenchange', () => void checkWindow());
// Make sure the popup window really went full screen (macOS sometimes drops the first request).
void (async () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await sleep(300);
  for (let attempt = 0; attempt < 4; attempt++) {
    const win = await checkWindow();
    if (barless || win?.type !== 'popup' || win.id === undefined) return;
    if (win.state === 'fullscreen') {
      await chrome.windows.update(win.id, { state: 'normal' }).catch(() => undefined);
      await sleep(700);
    }
    await chrome.windows.update(win.id, { state: 'fullscreen' }).catch(() => undefined);
    await sleep(1200);
  }
})();

// Keep the display from sleeping while this page is open.
let lock: { release(): Promise<void> } | null = null;
async function keepAwake() {
  try {
    lock = (await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
  } catch {
    lock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !lock) void keepAwake();
  if (document.visibilityState === 'hidden') lock = null;
});
void keepAwake();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pomo?.newValue) {
    pomo = changes.pomo.newValue as PomoState;
    drawControls();
    render();
  }
});
window.addEventListener('resize', () => void checkWindow());
window.addEventListener('hashchange', () => {
  ({ mode, minutes } = parseHash());
  if (mode === 'timer') resetTimer(false);
  drawControls();
  render();
});

void send('pomo:get', {}).then((p) => {
  pomo = p;
  drawControls();
  render();
});
drawControls();
render();
wake();
setInterval(render, 250);
