// "Force H.264": report VP9/AV1 as unsupported so YouTube serves H.264 (hardware decoded, easier on battery).
// Takes effect on the next video load after enabling. Usually caps quality at 1080p.

export function installCodecBlock(enabled: () => boolean) {
  const blocked = (type: string) => enabled() && /vp0?9|av01/i.test(type);

  for (const ctor of [window.MediaSource, (window as unknown as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource]) {
    if (!ctor?.isTypeSupported) continue;
    const orig = ctor.isTypeSupported.bind(ctor);
    ctor.isTypeSupported = (type: string) => (blocked(type) ? false : orig(type));
  }

  const origCan = HTMLMediaElement.prototype.canPlayType;
  HTMLMediaElement.prototype.canPlayType = function (type: string) {
    return blocked(type) ? '' : origCan.call(this, type);
  };
}
