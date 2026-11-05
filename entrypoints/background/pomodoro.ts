// Pomodoro timer: state in storage, phase end via chrome.alarms, notifications.
import { loadSettings } from '../../lib/settings';
import type { PomoState } from '../../lib/types';
import { advance, initialState, pause, phaseMs, start } from './pomodoro-core';

export const POMO_KEY = 'pomo';
export const POMO_ALARM = 'pomo';

export async function getPomo(): Promise<PomoState> {
  const got = (await chrome.storage.local.get(POMO_KEY))[POMO_KEY] as PomoState | undefined;
  if (got) return got;
  return initialState((await loadSettings()).pomodoro);
}

async function save(s: PomoState) {
  await chrome.storage.local.set({ [POMO_KEY]: s });
  if (s.status === 'running') await chrome.alarms.create(POMO_ALARM, { when: s.endsAt });
  else await chrome.alarms.clear(POMO_ALARM);
  return s;
}

export async function pomoAction(action: 'start' | 'pause' | 'reset' | 'skip'): Promise<PomoState> {
  const now = Date.now();
  const p = (await loadSettings()).pomodoro;
  const s = await getPomo();
  switch (action) {
    case 'start':
      return save(start(s, now));
    case 'pause':
      return save(pause(s, now));
    case 'reset':
      return save(initialState(p));
    case 'skip':
      return save(advance(s, p, now, false));
  }
}

const MESSAGES: Record<PomoState['phase'], [string, string]> = {
  work: ['Break over', 'Time to focus.'],
  short: ['Focus session done', 'Take a short break.'],
  long: ['Great work!', 'Take a long break.'],
};

export async function onPomoAlarm() {
  const settings = await loadSettings();
  const s = await getPomo();
  if (s.status !== 'running') return;
  const next = advance(s, settings.pomodoro, Date.now(), true);
  await save(next);
  if (settings.pomodoro.notify) {
    const [title, body] = MESSAGES[next.phase];
    chrome.notifications.create(`pomo-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title,
      message: next.status === 'running' ? `${body} Timer started.` : `${body} Open FOCUS to start.`,
      priority: 2,
    });
  }
}

/** Keep the idle timer's length in sync when durations change in settings. */
export async function syncPomoDurations() {
  const s = await getPomo();
  if (s.status !== 'idle') return;
  const p = (await loadSettings()).pomodoro;
  const remaining = phaseMs(s.phase, p);
  if (remaining !== s.remaining) await save({ ...s, remaining });
}
