// Formatting helpers shared by the badge, popup and options.

/** Toolbar badge text (max ~4 chars): "", "<1m", "45m", "1:05", "12h". */
export function badgeText(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (ms <= 0) return '';
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 10) return `${h}:${String(min % 60).padStart(2, '0')}`;
  return `${h}h`;
}

/** Human duration: "0m", "12m", "1h 05m". */
export function duration(ms: number): string {
  if (ms > 0 && ms < 60000) return '<1m';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

/** mm:ss for the Pomodoro timer. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "1:02:03" / "12:34" -> seconds. Returns null for LIVE or unparsable text. */
export function parseDuration(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.trim().match(/^(\d+)(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (!m) return null;
  const parts = text.trim().split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** 1234567 -> "1.2M". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** "3 hours ago" style relative time. */
export function relativeTime(date: number, now = Date.now()): string {
  const s = Math.round((now - date) / 1000);
  const units: [number, string][] = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [secs, name] of units) {
    const v = Math.floor(s / secs);
    if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Minutes left, rounded up ("25m"), so the badge never reads 0 while time remains. */
export function pomoBadge(ms: number): string {
  if (ms <= 0) return '0m';
  const min = Math.ceil(ms / 60000);
  return min < 100 ? `${min}m` : `${Math.floor(min / 60)}h`;
}

/** Countdown for the flip clock: "24:59", or "1:05:00" from an hour up. Rounds up so it shows 00:00 only at the end. */
export function countdownText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Wall clock for the flip clock: "09:41" (12-hour) or "21:41" (24-hour). */
export function clockText(d: Date, hour12: boolean): string {
  let h = d.getHours();
  if (hour12) h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
