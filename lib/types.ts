import type { ChannelRef } from './defaults';

export type Phase = 'work' | 'short' | 'long';
export interface PomoState {
  phase: Phase;
  status: 'idle' | 'running' | 'paused';
  endsAt: number; // when running
  remaining: number; // ms, when idle/paused
  completed: number; // work sessions finished (resets with "reset")
}

export type StRange = '24h' | 'today' | '7d';
export interface StSummary {
  range: StRange;
  total: number; // ms
  domains: { domain: string; ms: number }[];
  /** Totals per hour (24h/today) or per day (7d), oldest first. */
  series: { start: number; ms: number }[];
}

export interface VideoMeta {
  c: string; // category id
  t: string; // original title
  l?: string; // default audio language
}

export interface SbSegment {
  start: number;
  end: number;
  category: string;
  uuid: string;
}

export interface Branding {
  title?: string;
  thumbTime?: number;
}

export interface CurrentVideo {
  videoId: string;
  channelId?: string;
  author?: string;
  category?: string;
  title?: string;
  speed: number;
  boost: number;
}

export interface TabStatus {
  page: 'home' | 'watch' | 'channel' | 'search' | 'other';
  video?: CurrentVideo;
  channel?: ChannelRef;
}
