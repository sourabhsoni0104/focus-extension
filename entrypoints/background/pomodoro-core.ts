// Pure Pomodoro state transitions (unit tested).
import type { Settings } from '../../lib/defaults';
import type { Phase, PomoState } from '../../lib/types';

export const phaseMs = (phase: Phase, p: Settings['pomodoro']) =>
  Math.max(1, phase === 'work' ? p.work : phase === 'short' ? p.short : p.long) * 60000;

export const initialState = (p: Settings['pomodoro']): PomoState => ({
  phase: 'work',
  status: 'idle',
  endsAt: 0,
  remaining: phaseMs('work', p),
  completed: 0,
});

export function start(s: PomoState, now: number): PomoState {
  if (s.status === 'running') return s;
  return { ...s, status: 'running', endsAt: now + s.remaining };
}

export function pause(s: PomoState, now: number): PomoState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', remaining: Math.max(0, s.endsAt - now) };
}

/** Move to the next phase. `finished` = the phase ran to completion (counts work sessions). */
export function advance(s: PomoState, p: Settings['pomodoro'], now: number, finished: boolean): PomoState {
  const completed = s.phase === 'work' && finished ? s.completed + 1 : s.completed;
  let phase: Phase;
  if (s.phase === 'work') phase = completed > 0 && completed % Math.max(1, p.longEvery) === 0 && finished ? 'long' : 'short';
  else phase = 'work';
  const auto = finished && (phase === 'work' ? p.autoStartWork : p.autoStartBreaks);
  const remaining = phaseMs(phase, p);
  return auto
    ? { phase, status: 'running', endsAt: now + remaining, remaining, completed }
    : { phase, status: 'idle', endsAt: 0, remaining, completed };
}
