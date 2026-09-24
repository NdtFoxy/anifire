/** Shared types for the custom video player. */

/** A single timed line of dialogue. */
export interface Cue {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

/** One subtitle track (one language). */
export interface SubtitleTrack {
  id: string;
  label: string; // e.g. "Русский", "Romaji", "English"
  lang: string; // BCP-47, e.g. "ru", "ja", "en"
  cues: Cue[];
}

/** Intro / outro / recap segments shown as markers on the scrubber. */
export type ChapterKind = "intro" | "outro" | "recap";

export interface Chapter {
  start: number;
  end: number;
  kind: ChapterKind;
  label?: string;
}

/** Which subtitle slot a track is assigned to (dual subtitles). */
export interface SubtitleSelection {
  primary: string | null; // track id rendered on the lower line
  secondary: string | null; // track id rendered on the upper line
}

/** Per-line subtitle styling, applied independently to each slot. */
export interface SubtitleStyle {
  fontSize: number; // px at 1080p reference, scaled to the viewport
  color: string;
  opacity: number; // 0..1, text opacity
  background: number; // 0..1, backdrop opacity behind the text
  weight: 400 | 500 | 600 | 700;
  fontFamily: string;
  edge: "none" | "outline" | "shadow";
}

/** Experimental client-side upscaling target. AI modes are scaffolded for later. */
export type UpscaleMode = "off" | "sharp" | "ai-2x" | "ai-4k";

export interface PlayerSettings {
  selection: SubtitleSelection;
  primaryStyle: SubtitleStyle;
  secondaryStyle: SubtitleStyle;
  /** Vertical offset of the whole subtitle block from the bottom, in % of height. */
  subtitlePosition: number;
  playbackRate: number;
  quality: string;
  upscale: UpscaleMode;
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
}

export interface PlayerQuality {
  label: string;
  height: number;
  src: string;
}

/**
 * One creative the server decided to play. Every field the law requires is data
 * from the campaign, never something the client composes: «Реклама», the
 * advertiser's legal name, the age marker and the disclaimer are rendered
 * verbatim or not at all.
 */
export interface AdSlot {
  /** Opaque server decision id. Required on every reported event. */
  decisionId: string;
  kind: "PREROLL";
  src: string;
  durationSec: number;
  /** Seconds before Skip appears; null means the roll cannot be skipped. */
  skipAfterSec: number | null;
  clickUrl: string | null;
  advertiser: string;
  /** Legal marker, always «Реклама». Server-provided so it can never drift. */
  label: string;
  disclaimer: string | null;
  ageRating: number | null;
}

/**
 * The whole ad decision for one playback. Absent, null or empty means "no ad":
 * there is no client-side ad decision, and the JWT's `adsFree` claim is UI-only
 * and must never be consulted here.
 */
export interface AdPlan {
  slots: AdSlot[];
}

export interface PlayerSource {
  key: string; // stable id, e.g. `${animeId}-${episode}` — dedupes full/mini handoff
  selfHref: string; // URL of this player's own watch page, for "maximize"
  title: string; // localized series title, top-left line 1
  subtitle?: string; // original/romaji title, top-left line 2
  episodeLabel: string; // bottom-left line 1, e.g. "Эпизод 1"
  episodeTitle?: string; // bottom-left line 2
  src: string; // video URL
  qualities?: PlayerQuality[];
  poster?: string;
  tracks: SubtitleTrack[];
  chapters: Chapter[];
  /** Navigation hrefs for prev / next episode, if any. */
  prevHref?: string;
  nextHref?: string;
  backHref: string;
  /** Resolved source provider, e.g. "AniLiberty" for a real dub, or a fallback marker. */
  provider?: string;
  /** AniList id / MAL id + episode, enabling on-demand LLM subtitle translation. */
  anilistId?: number;
  malId?: number;
  episode?: number;
  /**
   * Where to start, in seconds. Set when the viewer arrived from a deep link
   * ("watch this scene again"), and it wins over the saved resume position —
   * they asked for this exact moment.
   */
  startAt?: number;
  /**
   * Advertising the server decided to play before this episode. Present only
   * for a viewer it applies to; an ads-free viewer gets null or no slots.
   */
  adPlan?: AdPlan | null;
}
