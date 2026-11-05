// Effective settings = user settings + Deep Focus rules while a focus window is active.
import { DEEP_FOCUS, deepMerge, type Settings } from './defaults';
import type { PomoState } from './types';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** True when `now` falls in the schedule. Handles ranges that cross midnight (e.g. 22:00–02:00). */
export function inSchedule(s: Settings['limits'], now = new Date()): boolean {
  if (!s.scheduleEnabled) return false;
  const start = toMinutes(s.scheduleStart);
  const end = toMinutes(s.scheduleEnd);
  const cur = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  if (start === end) return s.scheduleDays.includes(day);
  if (start < end) return s.scheduleDays.includes(day) && cur >= start && cur < end;
  // Overnight: the part after midnight belongs to the previous day's schedule.
  if (cur >= start) return s.scheduleDays.includes(day);
  if (cur < end) return s.scheduleDays.includes((day + 6) % 7);
  return false;
}

export function pomodoroWorkActive(p: PomoState | undefined): boolean {
  return !!p && p.phase === 'work' && p.status === 'running';
}

export interface FocusReason {
  schedule: boolean;
  pomodoro: boolean;
}

export function focusReason(s: Settings, pomo: PomoState | undefined, now = new Date()): FocusReason {
  return {
    schedule: inSchedule(s.limits, now),
    pomodoro: s.pomodoro.deepFocusDuringWork && pomodoroWorkActive(pomo),
  };
}

export function effectiveSettings(s: Settings, pomo: PomoState | undefined, now = new Date()): Settings {
  const r = focusReason(s, pomo, now);
  if (!r.schedule && !r.pomodoro) return s;
  const out = deepMerge(s, DEEP_FOCUS);
  // Keep a curated home; otherwise hide it.
  if (out.focus.homeMode === 'normal') out.focus.homeMode = 'hidden';
  return out;
}
