"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { PlayerSource } from "./types";

/**
 * Attaches the chosen quality of the current source to the <video>: natively
 * for progressive files and Safari's built-in HLS, through a lazily loaded
 * hls.js everywhere else. A quality switch keeps the position and play state;
 * a new source starts at the requested second (or zero).
 *
 * @returns the quality ladder offered in the settings menu
 */
export function useMediaSource({
  videoRef,
  source,
  quality,
  requestedStart,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  source: PlayerSource | null;
  /** Selected quality label; "Auto" takes the source's first rung. */
  quality: string;
  /** Deep-link start point, applied only when the media itself changes. */
  requestedStart: number | undefined;
}) {
  const mediaKeyRef = useRef<string | null>(null);
  // Position and play state captured by the previous attachment's cleanup. The
  // cleanup's `load()` resets currentTime to 0 and pauses the element before the
  // next effect runs, so reading the <video> there would always restart a quality
  // switch at 0:00, paused. Tied to the element: closing and reopening the same
  // episode mounts a fresh <video>, which must start clean.
  const handoffRef = useRef<{ video: HTMLVideoElement; time: number; playing: boolean } | null>(
    null
  );

  const qualityOptions = useMemo(() => {
    const labels = source?.qualities?.map((q) => q.label).filter(Boolean) ?? [];
    return ["Auto", ...(labels.length ? labels : ["1080p", "720p", "480p"])];
  }, [source?.qualities]);
  const activeSrc = useMemo(() => {
    if (!source) return undefined;
    if (quality === "Auto") {
      return source.qualities?.[0]?.src ?? source.src;
    }
    return source.qualities?.find((q) => q.label === quality)?.src ?? source.src;
  }, [source, quality]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeSrc) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;
    const handoff = handoffRef.current?.video === v ? handoffRef.current : null;
    handoffRef.current = null;
    // Every re-run on the same element goes through a cleanup that leaves a
    // handoff, so "same media" means: same episode AND same element.
    const sameMedia = mediaKeyRef.current === source?.key ? handoff : null;
    // A deep link asks for one specific second; otherwise keep the position we
    // already had when only the quality changed.
    const resumeAt = sameMedia ? sameMedia.time : requestedStart ?? 0;
    const shouldResume = sameMedia?.playing ?? false;
    const restorePlayback = () => {
      if (resumeAt > 0 && Number.isFinite(v.duration)) {
        v.currentTime = Math.min(resumeAt, Math.max(0, v.duration - 0.2));
      }
      if (shouldResume) v.play().catch(() => {});
    };
    mediaKeyRef.current = source?.key ?? null;
    const detach = () => {
      v.removeEventListener("loadedmetadata", restorePlayback);
      handoffRef.current = { video: v, time: v.currentTime, playing: !v.paused && !v.ended };
      v.removeAttribute("src");
      v.load();
    };

    v.addEventListener("loadedmetadata", restorePlayback, { once: true });
    const isHls = activeSrc.includes(".m3u8");

    if (!isHls) {
      v.src = activeSrc;
      v.load();
      return detach;
    }

    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = activeSrc;
      v.load();
      return detach;
    }

    import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !videoRef.current) return;
      if (!Hls.isSupported()) {
        videoRef.current.src = activeSrc;
        videoRef.current.load();
        return;
      }
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(activeSrc);
      hls.attachMedia(videoRef.current);
      cleanup = () => hls.destroy();
    });

    return () => {
      cancelled = true;
      // Snapshot before hls.destroy() detaches the media and drops the position.
      const time = v.currentTime;
      const playing = !v.paused && !v.ended;
      cleanup?.();
      detach();
      handoffRef.current = { video: v, time, playing };
    };
  }, [activeSrc, source?.key, requestedStart, videoRef]);

  return { qualityOptions };
}
