// Removes ad instructions from YouTube's player data before the player reads it.

const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds'] as const;

/** Delete ad keys from a player response (or a wrapper holding one). Returns true when something was removed. */
export function pruneAds(obj: unknown, depth = 0): boolean {
  if (!obj || typeof obj !== 'object' || depth > 2) return false;
  if (Array.isArray(obj)) return obj.map((o) => pruneAds(o, depth + 1)).some(Boolean);
  const rec = obj as Record<string, unknown>;
  let changed = false;
  for (const k of AD_KEYS) {
    if (k in rec) {
      delete rec[k];
      changed = true;
    }
  }
  if (rec.playerResponse) changed = pruneAds(rec.playerResponse, depth + 1) || changed;
  return changed;
}

/** Make a patched function look native to simple integrity checks. */
function disguise<F extends (...args: never[]) => unknown>(fn: F, orig: (...args: never[]) => unknown): F {
  Object.defineProperty(fn, 'name', { value: orig.name });
  Object.defineProperty(fn, 'toString', { value: () => Function.prototype.toString.call(orig), enumerable: false });
  return fn;
}

function trapGlobal(name: string, enabled: () => boolean) {
  const w = window as unknown as Record<string, unknown>;
  let value = w[name];
  if (value && enabled()) pruneAds(value);
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (v) => {
        if (enabled()) pruneAds(v);
        value = v;
      },
    });
  } catch {
    /* already non-configurable */
  }
}

export function installAdPrune(enabled: () => boolean) {
  trapGlobal('ytInitialPlayerResponse', enabled);

  const origParse = JSON.parse;
  JSON.parse = disguise(function (this: unknown, text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) {
    const result = origParse.call(JSON, text, reviver);
    if (enabled() && result && typeof result === 'object') {
      try {
        pruneAds(result);
      } catch {
        /* never break parsing */
      }
    }
    return result;
  } as typeof JSON.parse, origParse);

  const origJson = Response.prototype.json;
  Response.prototype.json = disguise(function (this: Response) {
    return origJson.call(this).then((data: unknown) => {
      if (enabled() && /\/youtubei\/v1\/(player|next)/.test(this.url)) pruneAds(data);
      return data;
    });
  }, origJson);
}
