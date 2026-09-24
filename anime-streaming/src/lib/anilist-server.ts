/**
 * Server-side AniList access with one shared cache for every visitor.
 *
 * AniList rate-limits per client IP (currently ~30 requests/minute), so asking it
 * from each browser meant 429s halfway through a single page. Here every MAL id
 * is fetched once per TTL for the whole site, concurrent requests for the same id
 * share one upstream call, a 429 is retried after the advertised delay, and a
 * stale entry is served when AniList is refusing us rather than failing the page.
 */
const ANILIST_URL = "https://graphql.anilist.co";
const TTL_MS = 12 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5000;

const QUERY = `
  query ($idMal: Int) {
    Media(idMal: $idMal, type: ANIME) {
      id
      bannerImage
      seasonYear
      coverImage { extraLarge large }
      title { romaji english native }
      trailer { id site thumbnail }
      streamingEpisodes { title thumbnail }
    }
  }
`;

export interface AniListMedia {
  id: number | null;
  bannerImage: string | null;
  seasonYear: number | null;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  title: { romaji: string | null; english: string | null; native: string | null } | null;
  trailer: { id: string | null; site: string | null; thumbnail: string | null } | null;
  streamingEpisodes: { title: string | null; thumbnail: string | null }[] | null;
}

interface Entry {
  media: AniListMedia | null;
  expires: number;
}

const cache = new Map<number, Entry>();
const inFlight = new Map<number, Promise<AniListMedia | null>>();

function remember(malId: number, media: AniListMedia | null): void {
  if (cache.size >= MAX_ENTRIES) {
    // Map iterates in insertion order: drop the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(malId, { media, expires: Date.now() + (media ? TTL_MS : MISS_TTL_MS) });
}

async function load(malId: number): Promise<AniListMedia | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { idMal: malId } }),
        cache: "no-store",
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2;
        await sleep(retryAfter * 1000 * (attempt + 1));
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`AniList ${res.status}`);
      const data = (await res.json()) as { data?: { Media?: AniListMedia | null } };
      return data.data?.Media ?? null;
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  throw new Error("AniList unavailable");
}

/** Media for a MAL id; null when AniList has no such title. Throws only with nothing cached. */
export async function aniListMedia(malId: number): Promise<AniListMedia | null> {
  if (!malId) return null;
  const hit = cache.get(malId);
  if (hit && hit.expires > Date.now()) return hit.media;

  const pending = inFlight.get(malId);
  if (pending) return pending;

  const request = load(malId)
    .then((media) => {
      remember(malId, media);
      return media;
    })
    .catch((err) => {
      // AniList is refusing us: an expired answer beats a broken page.
      if (hit) return hit.media;
      throw err;
    })
    .finally(() => inFlight.delete(malId));
  inFlight.set(malId, request);
  return request;
}

export async function resolveAnilistId(malId: number): Promise<number | null> {
  try {
    return (await aniListMedia(malId))?.id ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}
