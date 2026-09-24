import { NextResponse } from "next/server";
import { aniListMedia } from "@/lib/anilist-server";

/**
 * GET /api/anilist?idMal=52991 — AniList media for a MAL id, served from the
 * shared server cache (see lib/anilist-server). Browsers never call AniList.
 */
export async function GET(request: Request) {
  const idMal = Number(new URL(request.url).searchParams.get("idMal"));
  if (!Number.isInteger(idMal) || idMal <= 0) {
    return NextResponse.json({ error: "idMal must be a positive integer" }, { status: 400 });
  }
  try {
    const media = await aniListMedia(idMal);
    if (!media) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(media, {
      // Let the browser and any CDN reuse it; the server cache holds it longer.
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "anilist_unavailable" }, { status: 503 });
  }
}
