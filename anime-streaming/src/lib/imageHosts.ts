/**
 * Image CDNs that next/image may optimize (fetch, resize and re-encode through
 * /_next/image). Shared by next.config.ts (`images.remotePatterns`) and
 * RemoteImage, which serves every other source `unoptimized` so an unlisted
 * host renders as a plain <img> instead of throwing.
 *
 * The backend origin (NEXT_PUBLIC_BACKEND_URL, localhost:8080 in dev) is left
 * out on purpose: Next 16 refuses to optimize private/local IPs, and the
 * production origin is only known at runtime.
 */
export const OPTIMIZED_IMAGE_HOSTS = [
  "s4.anilist.co", // AniList cover and banner images
  "image.tmdb.org", // TMDB backdrops and title logos
  "cdn.myanimelist.net", // MAL/Jikan posters (also the backend's stored imageUrl)
  "i.ytimg.com", // AniList trailer thumbnails (YouTube)
  "aniliberty.top", // AniLiberty release and episode posters
] as const;

/** True when next/image can optimize `src` with the current images config. */
export function isOptimizableImage(src: string): boolean {
  // Bundled /public assets; query strings need images.localPatterns, so skip them.
  if (src.startsWith("/")) return !src.startsWith("//") && !src.includes("?");
  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      (OPTIMIZED_IMAGE_HOSTS as readonly string[]).includes(url.hostname)
    );
  } catch {
    return false;
  }
}
