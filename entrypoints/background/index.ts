import { defineBackground } from 'wxt/utils/define-background';
import { listen } from '../../lib/messages';
import { loadSettings, watchSettings } from '../../lib/settings';
import type { Settings } from '../../lib/defaults';
import { updateBadge } from './badge';
import { resolveChannel } from './channels';
import { branding, dislikes, sponsorSegments } from './community';
import { getPomo, onPomoAlarm, POMO_ALARM, POMO_KEY, pomoAction, syncPomoDurations } from './pomodoro';
import { domainTime, refresh, resetData, setIdleInterval, setupScreenTime, summary } from './screentime';
import { listCategories, testKey, videoMeta } from './youtube-api';

const TICK = 'tick';

async function applyAdRules(s: Settings) {
  const on = s.enabled && s.ads.enabled && s.ads.network;
  await chrome.declarativeNetRequest.updateEnabledRulesets(on ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] });
}

export default defineBackground(() => {
  // Listeners are registered synchronously so the service worker wakes for them.
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === POMO_ALARM) await onPomoAlarm();
    if (alarm.name === TICK) await refresh();
    await updateBadge();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[POMO_KEY]) void updateBadge();
  });

  let prev: Settings | null = null;
  watchSettings(async (s) => {
    await applyAdRules(s);
    if (!prev || prev.screentime.idleMinutes !== s.screentime.idleMinutes) setIdleInterval(s.screentime.idleMinutes);
    if (!prev || JSON.stringify(prev.pomodoro) !== JSON.stringify(s.pomodoro)) await syncPomoDurations();
    prev = s;
    await refresh();
    await updateBadge();
  });

  listen({
    'st:summary': (m) => summary(m.range),
    'st:domainTime': (m) => domainTime(m.domain, m.range),
    'st:reset': async () => {
      await resetData();
      await updateBadge();
      return true as const;
    },
    'pomo:get': () => getPomo(),
    'pomo:action': async (m) => {
      const s = await pomoAction(m.action);
      await updateBadge();
      return s;
    },
    'yt:categories': (m) => listCategories(m.force),
    'yt:videos': (m) => videoMeta(m.ids),
    'yt:testKey': (m) => testKey(m.key),
    'channel:resolve': (m) => resolveChannel(m.input),
    'sb:segments': (m) => sponsorSegments(m.videoId, m.categories),
    'ryd:votes': (m) => dislikes(m.videoId),
    'da:branding': (m) => branding(m.videoId),
    'ui:openOptions': async (m) => {
      await chrome.tabs.create({ url: chrome.runtime.getURL(`/options.html${m.hash ? '#' + m.hash : ''}`) });
      return true as const;
    },
  });

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') chrome.runtime.openOptionsPage();
  });

  void (async () => {
    await chrome.alarms.create(TICK, { periodInMinutes: 1 });
    const s = await loadSettings();
    prev = s;
    await applyAdRules(s);
    await setupScreenTime(() => void updateBadge());
    // Recover a Pomodoro alarm lost while Chrome was closed.
    const p = await getPomo();
    if (p.status === 'running' && p.endsAt <= Date.now()) await onPomoAlarm();
    else if (p.status === 'running') await chrome.alarms.create(POMO_ALARM, { when: p.endsAt });
    await updateBadge();
  })();
});
