import type {
  Chapter,
  PlayerSource,
  PlayerQuality,
  SubtitleTrack,
} from "@/components/player/types";
import { API_BASE, AuthError, authFetch } from "@/lib/auth-client";
import type { Movie } from "./mockAnime";
import type { AniReleaseFull } from "./animeApi";

/**
 * Mock playback source. Real integration: swap `src` for an HLS manifest and
 * load `tracks` from the backend's stored .vtt files via `loadTrack()`. The
 * demo ships two simultaneous subtitle tracks (Russian + Romaji) so the dual
 * subtitle UI is exercised end-to-end.
 */

// Public CORS-friendly sample so the player is actually playable in dev.
const SAMPLE_VIDEO =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const RU_CUES = [
  { start: 2, end: 6, text: "В этом городе что-то пробудилось." },
  { start: 6.5, end: 11, text: "Семеро мастеров призвали своих слуг." },
  { start: 12, end: 17, text: "Война за Святой Грааль —\nно что-то пошло не так." },
  { start: 18, end: 23, text: "Подделка, ставшая реальностью." },
  { start: 24, end: 29, text: "— Ты тоже это чувствуешь?\n— Да. Ветер переменился." },
  { start: 30, end: 35, text: "Сегодня всё решится." },
];

const ROMAJI_CUES = [
  { start: 2, end: 6, text: "Kono machi de nanika ga mezameta." },
  { start: 6.5, end: 11, text: "Shichinin no masutā ga sābanto o yonda." },
  { start: 12, end: 17, text: "Seihai Sensō — daga nanika ga okashii." },
  { start: 18, end: 23, text: "Nisemono ga genjitsu to natta." },
  { start: 24, end: 29, text: "— Kimi mo kanjiru ka?\n— Aa. Kaze ga kawatta." },
  { start: 30, end: 35, text: "Kyō, subete ga kimaru." },
];

function demoTracks(): SubtitleTrack[] {
  return [
    { id: "ru", label: "Русский", lang: "ru", cues: RU_CUES },
    { id: "romaji", label: "Ромадзи", lang: "ja-Latn", cues: ROMAJI_CUES },
    { id: "en", label: "English", lang: "en", cues: [] },
  ];
}

function demoChapters(): Chapter[] {
  return [
    { start: 8, end: 48, kind: "intro", label: "Intro" },
    { start: 540, end: 580, kind: "outro", label: "Outro" },
  ];
}

function demoQualities(src = SAMPLE_VIDEO): PlayerQuality[] {
  return [
    { label: "1080p", height: 1080, src },
    { label: "720p", height: 720, src },
    { label: "480p", height: 480, src },
  ];
}

export function buildPlayerSource(
  movie: Movie,
  episode: number,
  total: number,
  poster?: string | null
): PlayerSource {
  const prev = episode > 1 ? episode - 1 : null;
  const next = episode < total ? episode + 1 : null;
  const base = `/watch/${movie.id}`;
  return {
    key: `${movie.id}-${episode}`,
    selfHref: `${base}?ep=${episode}`,
    title: movie.title,
    subtitle: movie.genre,
    episodeLabel: `Episode ${episode}`,
    episodeTitle: "Heroic incident",
    src: SAMPLE_VIDEO,
    qualities: demoQualities(),
    poster: poster || movie.heroImageUrl,
    tracks: demoTracks(),
    chapters: demoChapters(),
    backHref: `/anime/${movie.id}`,
    prevHref: prev ? `${base}?ep=${prev}` : undefined,
    nextHref: next ? `${base}?ep=${next}` : undefined,
    provider: "local-fallback",
  };
}

/** True when the resolved source is a real dub rather than a demo/fallback clip. */
export function hasRealVideo(source: PlayerSource): boolean {
  return source.provider === "AniLiberty";
}

/**
 * Build a player source for a release fetched straight from AniLiberty (used by
 * the "New Episodes" feed, which links into our own player rather than the
 * external site). Returns null if the requested episode has no playable HLS.
 */
export function buildAniLibertySource(
  release: AniReleaseFull,
  episode: number
): PlayerSource | null {
  const ep =
    release.episodes.find((e) => e.ordinal === episode) ?? release.episodes[0];
  if (!ep || ep.hls.length === 0) return null;

  const ordinals = release.episodes.map((e) => e.ordinal);
  const idx = ordinals.indexOf(ep.ordinal);
  const prev = idx > 0 ? ordinals[idx - 1] : null;
  const next = idx >= 0 && idx < ordinals.length - 1 ? ordinals[idx + 1] : null;
  const base = `/watch/${release.alias}`;

  const chapters: Chapter[] = [];
  if (ep.opening?.start != null && ep.opening?.stop != null) {
    chapters.push({ start: ep.opening.start, end: ep.opening.stop, kind: "intro", label: "Intro" });
  }
  if (ep.ending?.start != null && ep.ending?.stop != null) {
    chapters.push({ start: ep.ending.start, end: ep.ending.stop, kind: "outro", label: "Outro" });
  }

  return {
    key: `ani-${release.alias}-${ep.ordinal}`,
    selfHref: `${base}?ep=${ep.ordinal}`,
    title: release.title,
    subtitle: release.subtitle ?? undefined,
    episodeLabel: `Episode ${ep.ordinal}`,
    episodeTitle: ep.name ?? undefined,
    src: ep.hls[0].src,
    qualities: ep.hls,
    poster: ep.poster ?? release.poster ?? undefined,
    tracks: [],
    chapters,
    backHref: "/",
    prevHref: prev ? `${base}?ep=${prev}` : undefined,
    nextHref: next ? `${base}?ep=${next}` : undefined,
    provider: "AniLiberty",
  };
}

/**
 * Which viewer a resolved source belongs to.
 *
 * A source payload now carries a per-viewer ad decision, so one shared key would
 * hand a subscriber the payload built for a guest and vice versa — exactly the
 * bug an ads-free subscription is bought to avoid. The readable CSRF cookie is
 * the only session marker this module can see synchronously; it is digested
 * rather than kept verbatim so no key carries a live token, and its rotation
 * (login, logout, token refresh) simply starts a fresh partition.
 */
function viewerBucket(): string {
  if (typeof document === "undefined") return "anon";
  const match = document.cookie.match(/(?:^|; )anifire_csrf=([^;]*)/);
  if (!match) return "anon";
  let hash = 5381;
  for (let i = 0; i < match[1].length; i += 1) {
    hash = (hash * 33 + match[1].charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * One resolved source per viewer+episode per page session.
 *
 * Deliberately memory-only, unlike the shared TTL cache this used to use: the
 * payload is now per-viewer and carries a one-shot ad decision, and localStorage
 * would both outlive the account it was fetched for and replay a decisionId the
 * server has long since closed. Signed HLS URLs expire anyway, so persistence
 * was always the weaker half of that bargain.
 *
 * Sharing the promise is the part that matters: the watch page resolves the
 * source from an effect that re-runs as the catalogue row and the episode list
 * arrive, and each re-run must reuse the first decision rather than mint another.
 */
const sessionSources = new Map<string, Promise<PlayerSource | null>>();

export async function fetchPlayerSource(
  movie: Movie,
  episode: number,
  total: number,
  poster?: string | null
): Promise<PlayerSource> {
  const key = `${viewerBucket()}:${movie.id}:${episode}`;
  let pending = sessionSources.get(key);
  if (!pending) {
    pending = loadRealSource(movie, episode);
    sessionSources.set(key, pending);
  }
  const real = await pending;
  if (!real) {
    // A failure is not remembered, so the next visit tries the real source again.
    sessionSources.delete(key);
    return buildPlayerSource(movie, episode, total, poster);
  }
  // Prefer the per-episode preview (AniList) as the player poster when we have one.
  return poster ? { ...real, poster } : real;
}

/**
 * Loads the real source. The bearer token is attached when a session exists so
 * the server can recognise a subscriber and answer with no ad plan; the endpoint
 * is public, so a guest — or anyone whose token has expired — still gets a fully
 * playable source. Auth is never allowed to cost a viewer their episode.
 */
async function loadRealSource(
  movie: Movie,
  episode: number
): Promise<PlayerSource | null> {
  const url = `${API_BASE}/api/v1/animes/${movie.id}/episodes/${episode}/source`;
  try {
    let res: Response;
    try {
      res = await authFetch(url, { cache: "no-store" });
    } catch (err) {
      // No session at all: the only expected failure, and it is not an error.
      if (!(err instanceof AuthError)) throw err;
      res = await fetch(url, { cache: "no-store" });
    }
    if (!res.ok) throw new Error(`Video API ${res.status}`);
    const source = (await res.json()) as PlayerSource;
    if (!source.src || !hasRealVideo(source)) return null;
    return {
      ...source,
      poster: source.poster || movie.heroImageUrl,
      qualities: source.qualities?.length ? source.qualities : demoQualities(source.src),
      tracks: source.tracks ?? demoTracks(),
      chapters: source.chapters ?? demoChapters(),
    };
  } catch {
    return null;
  }
}
