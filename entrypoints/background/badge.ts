// Toolbar badge: rolling-24h time on the current site; color shows Pomodoro phase.
import { badgeText, clock, duration, hostOf } from '../../lib/format';
import { loadSettings } from '../../lib/settings';
import { getPomo } from './pomodoro';
import { domainTime } from './screentime';

const COLORS = { idle: '#4b4b57', work: '#d93a3a', break: '#2f9e5b' };

export async function updateBadge() {
  const s = await loadSettings();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  const pomo = await getPomo();
  const running = pomo.status === 'running';
  const color = running ? (pomo.phase === 'work' ? COLORS.work : COLORS.break) : COLORS.idle;

  const domain = hostOf(tab.url);
  const ms = domain && s.screentime.enabled ? await domainTime(domain, '24h') : 0;
  const text = s.screentime.badge ? badgeText(ms) : running ? clock(pomo.endsAt - Date.now()).slice(0, 2) + 'm' : '';

  const lines = ['FOCUS'];
  if (domain) lines.push(`${domain}: ${duration(ms)} in the last 24h`);
  if (running) lines.push(`Pomodoro (${pomo.phase === 'work' ? 'focus' : 'break'}): ${clock(pomo.endsAt - Date.now())} left`);

  await Promise.all([
    chrome.action.setBadgeText({ tabId: tab.id, text }),
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color }),
    chrome.action.setBadgeTextColor?.({ tabId: tab.id, color: '#ffffff' }),
    chrome.action.setTitle({ tabId: tab.id, title: lines.join('\n') }),
  ]).catch(() => undefined);
}
