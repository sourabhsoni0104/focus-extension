// Player controller (MAIN world, so it can use YouTube's #movie_player API).
// Speed, keyboard shortcuts, wheel volume, volume boost, loudness normalization, quality, original audio track.
import { emit, TO_ISO } from '../../lib/bridge';
import type { Settings } from '../../lib/defaults';
import { toast } from '../../lib/dom';
import type { CurrentVideo } from '../../lib/types';

interface YTPlayer extends HTMLElement {
  getVideoData?(): { video_id?: string; author?: string; title?: string };
  getPlayerResponse?(): PlayerResponse | undefined;
  getVolume?(): number;
  setVolume?(v: number): void;
  isMuted?(): boolean;
  unMute?(): void;
  setPlaybackRate?(r: number): void;
  getAvailablePlaybackRates?(): number[];
  getAvailableQualityLevels?(): string[];
  setPlaybackQualityRange?(min: string, max?: string): void;
  setPlaybackQuality?(q: string): void;
  getAvailableAudioTracks?(): unknown[];
  getAudioTrack?(): unknown;
  setAudioTrack?(t: unknown): void;
}

interface PlayerResponse {
  videoDetails?: { videoId?: string; channelId?: string; author?: string; title?: string };
  microformat?: { playerMicroformatRenderer?: { category?: string } };
  streamingData?: { adaptiveFormats?: { audioTrack?: { id?: string; audioIsDefault?: boolean } }[] };
}

const QUALITY_ORDER = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];

const getPlayer = () => document.querySelector<YTPlayer>('#movie_player');
const getVideo = () => getPlayer()?.querySelector<HTMLVideoElement>('video.html5-main-video, video') ?? null;
const isAd = () => !!getPlayer()?.matches('.ad-showing, .ad-interrupting');
const round = (n: number) => Math.round(n * 100) / 100;

export function startPlayer(get: () => Settings) {
  let current: CurrentVideo | null = null;
  let enforceUntil = 0;
  let targetRate = 1;
  let lastNonDefault = 1.5;

  // --- volume boost (Web Audio) ---
  let audioCtx: AudioContext | null = null;
  let gain: GainNode | null = null;
  let boundVideo: HTMLVideoElement | null = null;
  let boost = 1;

  function ensureGraph(video: HTMLVideoElement): boolean {
    if (boundVideo === video && gain) return true;
    if (!navigator.userActivation?.hasBeenActive) return false; // AudioContext needs a user gesture
    try {
      audioCtx ??= new AudioContext();
      const source = audioCtx.createMediaElementSource(video);
      gain = audioCtx.createGain();
      source.connect(gain).connect(audioCtx.destination);
      boundVideo = video;
      return true;
    } catch {
      return false;
    }
  }

  function setBoost(v: number, show = false) {
    boost = Math.min(6, Math.max(1, round(v)));
    const video = getVideo();
    if (video && (boost > 1 || gain) && ensureGraph(video) && gain) {
      gain.gain.value = boost;
      if (audioCtx?.state === 'suspended') void audioCtx.resume();
    }
    if (show) toast(`Volume boost ${Math.round(boost * 100)}%`);
    publish();
  }

  // Apply a pending default boost once the user interacts with the page.
  const onGesture = () => {
    if (boost > 1) setBoost(boost);
    else if (audioCtx?.state === 'suspended') void audioCtx.resume();
  };
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('keydown', onGesture, true);

  // --- speed ---
  function setRate(rate: number, show: boolean) {
    const video = getVideo();
    const player = getPlayer();
    if (!video || isAd()) return;
    rate = Math.min(16, Math.max(0.1, round(rate)));
    targetRate = rate;
    if (rate !== 1) lastNonDefault = rate;
    if (player?.setPlaybackRate && player.getAvailablePlaybackRates?.().includes(rate)) player.setPlaybackRate(rate);
    video.playbackRate = rate;
    if (show) toast(`${rate}x`);
    publish();
  }

  function speedFor(s: Settings, v: CurrentVideo): number {
    const p = s.player;
    const perChannel = v.channelId ? p.channelSpeeds[v.channelId] : undefined;
    if (perChannel) return perChannel;
    if (p.musicNormalSpeed && v.category === 'Music') return 1;
    return p.defaultSpeed;
  }

  function publish() {
    if (!current) return;
    current = { ...current, speed: getVideo()?.playbackRate ?? targetRate, boost };
    emit(TO_ISO, { type: 'video', video: current });
  }

  // --- quality ---
  function applyQuality(s: Settings, tries = 0) {
    const want = s.player.defaultQuality;
    const player = getPlayer();
    if (want === 'auto' || !player?.getAvailableQualityLevels) return;
    const levels = player.getAvailableQualityLevels().filter((q) => q !== 'auto');
    if (!levels.length) {
      if (tries < 8) setTimeout(() => applyQuality(get(), tries + 1), 500);
      return;
    }
    let target: string = levels[0]!;
    if (want !== 'highest') {
      const idx = QUALITY_ORDER.indexOf(want);
      target = levels.find((q) => QUALITY_ORDER.indexOf(q) >= idx) ?? levels[levels.length - 1]!;
    }
    player.setPlaybackQualityRange?.(target, target);
    player.setPlaybackQuality?.(target);
  }

  // --- original audio track (best effort; YouTube's track objects are not a public API) ---
  function applyOriginalAudio(s: Settings, pr: PlayerResponse | undefined, tries = 0) {
    const player = getPlayer();
    if (!s.player.originalAudio || !player?.getAvailableAudioTracks || !player.setAudioTrack) return;
    const tracks = player.getAvailableAudioTracks();
    if (!tracks || tracks.length < 2) {
      if (tries < 6) setTimeout(() => applyOriginalAudio(get(), pr, tries + 1), 700);
      return;
    }
    const defaultId = pr?.streamingData?.adaptiveFormats?.find((f) => f.audioTrack?.audioIsDefault)?.audioTrack?.id;
    const describe = (t: unknown) => {
      try {
        return JSON.stringify(t, (_k, v) => (typeof v === 'function' ? undefined : v)).toLowerCase();
      } catch {
        return '';
      }
    };
    const original =
      (defaultId && tracks.find((t) => describe(t).includes(defaultId.toLowerCase()))) ||
      tracks.find((t) => describe(t).includes('original'));
    if (original && describe(player.getAudioTrack?.()) !== describe(original)) player.setAudioTrack(original);
  }

  // --- new video detection ---
  function onVideoLoaded() {
    const player = getPlayer();
    if (!player?.getVideoData || isAd()) return;
    const data = player.getVideoData();
    const pr = player.getPlayerResponse?.();
    const id = data.video_id ?? pr?.videoDetails?.videoId;
    if (!id) return;
    const s = get();
    const isNew = id !== current?.videoId;
    current = {
      videoId: id,
      channelId: pr?.videoDetails?.channelId,
      author: data.author ?? pr?.videoDetails?.author,
      title: data.title ?? pr?.videoDetails?.title,
      category: pr?.microformat?.playerMicroformatRenderer?.category,
      speed: getVideo()?.playbackRate ?? 1,
      boost,
    };
    if (!s.enabled) return publish();
    if (isNew || getVideo()?.playbackRate === 16) {
      setRate(speedFor(s, current), false);
      enforceUntil = Date.now() + 2500;
      if (isNew) {
        boost = s.player.volumeBoost;
        setBoost(boost);
        applyQuality(s);
        applyOriginalAudio(s, pr);
      }
    }
    publish();
  }

  document.addEventListener('loadedmetadata', (e) => e.target instanceof HTMLVideoElement && onVideoLoaded(), true);
  document.addEventListener('yt-navigate-finish', () => setTimeout(onVideoLoaded, 300));
  document.addEventListener('playing', (e) => e.target instanceof HTMLVideoElement && !current && onVideoLoaded(), true);

  // YouTube sometimes resets the rate right after load; hold our target briefly.
  document.addEventListener(
    'ratechange',
    (e) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || isAd()) return;
      if (Date.now() < enforceUntil && Math.abs(v.playbackRate - targetRate) > 0.01) v.playbackRate = targetRate;
      else if (Math.abs(v.playbackRate - targetRate) > 0.01) {
        targetRate = v.playbackRate; // changed via YouTube's own menu
        publish();
      }
    },
    true,
  );

  // --- loudness normalization off: keep the element volume equal to the player's slider ---
  document.addEventListener(
    'volumechange',
    (e) => {
      const s = get();
      const v = e.target;
      const player = getPlayer();
      if (!s.enabled || !s.player.disableLoudnessNorm || !(v instanceof HTMLVideoElement) || isAd() || !player?.getVolume) return;
      const want = player.getVolume() / 100;
      if (!v.muted && Math.abs(v.volume - want) > 0.01) v.volume = want;
    },
    true,
  );

  // --- keyboard shortcuts ---
  document.addEventListener(
    'keydown',
    (e) => {
      const s = get();
      if (!s.enabled || !s.player.shortcuts || e.ctrlKey || e.metaKey || e.altKey || !getVideo()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const key = e.key.toLowerCase();
      const p = s.player;
      const cur = getVideo()!.playbackRate;
      let next: number | null = null;
      if (key === p.keyFaster) next = cur + p.speedStep;
      else if (key === p.keySlower) next = cur - p.speedStep;
      else if (key === p.keyReset) next = Math.abs(cur - 1) < 0.01 ? lastNonDefault : 1;
      if (next === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setRate(next, true);
      if (p.rememberSpeed) emit(TO_ISO, { type: 'saveSpeed', value: targetRate, perChannel: false });
    },
    true,
  );

  // --- mouse wheel volume over the player ---
  document.addEventListener(
    'wheel',
    (e) => {
      const s = get();
      const player = getPlayer();
      const t = e.target as HTMLElement | null;
      if (!s.enabled || !s.player.wheelVolume || !player?.setVolume || !player.getVolume || !t || e.ctrlKey) return;
      if (!player.contains(t) || t.closest('.ytp-settings-menu, .ytp-panel-menu, .ytp-popup, .ytp-chrome-bottom .ytp-progress-bar')) return;
      if (player.classList.contains('ytp-small-mode') && !document.fullscreenElement && t.closest('ytd-miniplayer')) return;
      e.preventDefault();
      e.stopPropagation();
      const up = e.deltaY < 0;
      const vol = player.getVolume();
      if (up && vol >= 100 && s.player.wheelBoost) return setBoost(boost + 0.25, true);
      if (!up && boost > 1 && s.player.wheelBoost) return setBoost(boost - 0.25, true);
      const nextVol = Math.min(100, Math.max(0, vol + (up ? s.player.wheelStep : -s.player.wheelStep)));
      if (player.isMuted?.() && up) player.unMute?.();
      player.setVolume(nextVol);
      toast(`Volume ${Math.round(nextVol)}%`);
    },
    { capture: true, passive: false },
  );

  return {
    command(type: 'speed' | 'boost', value: number) {
      if (type === 'speed') setRate(value, true);
      else setBoost(value, true);
    },
    reapply() {
      // After an ad: restore the speed we want for this video.
      if (current && get().enabled) setRate(speedFor(get(), current), false);
    },
    onSettings() {
      const s = get();
      if (!current || !s.enabled) return;
      const want = speedFor(s, current);
      if (want !== targetRate && Math.abs((getVideo()?.playbackRate ?? 1) - targetRate) < 0.01) setRate(want, false);
    },
  };
}
