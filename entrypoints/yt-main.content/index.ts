// Runs in YouTube's own JavaScript world at document_start.
// No chrome.* APIs here; settings arrive from the ISOLATED script (and a localStorage copy for the first instant).
import { defineContentScript } from 'wxt/utils/define-content-script';
import { CFG_CACHE_KEY, emit, on, TO_ISO, TO_MAIN } from '../../lib/bridge';
import { DEFAULTS, withDefaults, type Settings } from '../../lib/defaults';
import { startAdSkipper } from './ad-skipper';
import { installAdPrune } from './ads-prune';
import { installCodecBlock } from './codec';
import { startPlayer } from './player';

function readCache(): Settings {
  try {
    const raw = localStorage.getItem(CFG_CACHE_KEY);
    return raw ? withDefaults(JSON.parse(raw)) : structuredClone(DEFAULTS);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    let settings = readCache();
    const get = () => settings;

    installCodecBlock(() => settings.enabled && settings.player.forceH264);
    installAdPrune(() => settings.enabled && settings.ads.enabled && settings.ads.prune);

    const player = startPlayer(get);
    startAdSkipper(get, () => player.reapply());

    on(TO_MAIN, (msg) => {
      if (msg.type === 'settings') {
        settings = withDefaults(msg.settings);
        player.onSettings();
      } else player.command(msg.type, msg.value);
    });
    emit(TO_ISO, { type: 'ready' });
  },
});
