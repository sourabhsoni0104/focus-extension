// Settings persistence in chrome.storage.local.
import { DEFAULTS, deepMerge, setPath, withDefaults, type Settings, type SettingsPatch } from './defaults';

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(KEY);
  return withDefaults(got[KEY]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

export async function updatePath(path: string, value: unknown): Promise<Settings> {
  const next = setPath(await loadSettings(), path, value);
  await saveSettings(next);
  return next;
}

export async function applyPatch(patch: SettingsPatch): Promise<Settings> {
  const next = deepMerge(await loadSettings(), patch);
  await saveSettings(next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  const s = structuredClone(DEFAULTS);
  await saveSettings(s);
  return s;
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(withDefaults(changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(fn);
  return () => chrome.storage.onChanged.removeListener(fn);
}
