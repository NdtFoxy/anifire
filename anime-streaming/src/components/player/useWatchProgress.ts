"use client";

import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import {
  resolveResume,
  saveProgress,
  writeLocalProgress,
  type ProgressInput,
} from "@/lib/library";

/**
 * Persists "where I stopped" and restores it on the next visit.
 *
 * <p>Saving is event-driven rather than purely periodic, because the moments a
 * position is most likely to be lost are exactly the ones a timer misses:
 * <ul>
 *   <li>every {@link TICK_MS} while playing — the steady heartbeat;</li>
 *   <li>on pause, seek and rate change — the user just made a decision;</li>
 *   <li>on tab hide — mobile browsers freeze background tabs without warning;</li>
 *   <li>on pagehide/beforeunload — the last chance, sent with `keepalive`;</li>
 *   <li>on source change and unmount — before the slot identity changes.</li>
 * </ul>
 * Every save also writes a local mirror, so a device that loses connectivity can
 * still resume and reconcile later.
 *
 * <p>Restoration only happens once per slot, only past {@link RESUME_FLOOR}, and
 * never for an episode the server already considers finished — nobody wants to be
 * dropped into the credits of something they completed.
 */

const TICK_MS = 10_000;
const RESUME_FLOOR = 10;
/** Ignore a resume that is effectively at the end of the file. */
const RESUME_TAIL = 20;

export interface ProgressSlot {
  /** Stable identity of the episode: catalogue id or slug. */
  animeKey: string;
  animeTitle?: string | null;
  episode: number;
  provider?: string | null;
}

export function useWatchProgress({
  videoRef,
  slot,
  playing,
  enabled,
  skipResume = false,
}: {
  /**
   * The player's own ref, not its current value: the <video> node is attached in
   * the same commit that renders it, and passing `ref.current` as a prop would
   * hand this hook a stale `null` whenever nothing else triggered a re-render.
   */
  videoRef: RefObject<HTMLVideoElement | null>;
  slot: ProgressSlot | null;
  playing: boolean;
  /** False for guests: there is no account to attach a position to. */
  enabled: boolean;
  /** Set when the caller already chose a start point and must not be overridden. */
  skipResume?: boolean;
}) {
  const lastSentRef = useRef(0);
  const restoredRef = useRef<string | null>(null);

  /**
   * One flush path for every trigger, so a save can never mean two things.
   *
   * An effect event always sees the latest `slot`/`enabled` without being a
   * dependency of the effects that install the listeners — the first render
   * (guest, no video element) must not freeze into the saved closure.
   */
  const flush = useEffectEvent((reason: string) => {
    const v = videoRef.current;
    if (!v || !slot || !enabled) return;
    const position = v.currentTime;
    if (!Number.isFinite(position) || position < 1) return;
    // Skip identical positions; a paused tab would otherwise beat on the API.
    if (reason === "tick" && Math.abs(position - lastSentRef.current) < 3) return;
    lastSentRef.current = position;

    const duration = Number.isFinite(v.duration) ? v.duration : null;
    writeLocalProgress(slot.animeKey, slot.episode, position, duration);
    const payload: ProgressInput = {
      animeKey: slot.animeKey,
      animeTitle: slot.animeTitle ?? null,
      episode: slot.episode,
      positionSeconds: position,
      durationSeconds: duration,
      provider: slot.provider ?? null,
    };
    void saveProgress(payload);
  });

  // Heartbeat — only while actually playing.
  useEffect(() => {
    if (!enabled || !playing) return;
    const id = window.setInterval(() => flush("tick"), TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled, playing]);

  // Decision points and teardown.
  const slotId = slot ? `${slot.animeKey}#${slot.episode}` : null;

  useEffect(() => {
    if (!enabled || !slotId) return;
    const v = videoRef.current;
    if (!v) return;

    const onPause = () => flush("pause");
    const onSeeked = () => flush("seek");
    const onEnded = () => flush("ended");
    const onHide = () => {
      if (document.visibilityState === "hidden") flush("hidden");
    };
    const onUnload = () => flush("unload");

    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
      flush("teardown");
    };
  }, [enabled, slotId, videoRef]);

  // Restore once per slot, after metadata gives us a duration to clamp against.
  useEffect(() => {
    if (!enabled || !slot || !slotId || skipResume) return;
    const video = videoRef.current;
    if (!video) return;
    if (restoredRef.current === slotId) return;
    restoredRef.current = slotId;

    let cancelled = false;
    const apply = async () => {
      const resume = await resolveResume(slot.animeKey, slot.episode);
      if (cancelled || !resume || resume.completed) return;
      if (resume.positionSeconds < RESUME_FLOOR) return;
      const seek = () => {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        if (resume.positionSeconds > duration - RESUME_TAIL) return;
        // Only jump forward into unwatched territory; never yank a viewer back.
        if (video.currentTime > resume.positionSeconds) return;
        video.currentTime = resume.positionSeconds;
      };
      if (Number.isFinite(video.duration) && video.duration > 0) seek();
      else video.addEventListener("loadedmetadata", seek, { once: true });
    };
    void apply();

    return () => {
      cancelled = true;
    };
  }, [enabled, slot, slotId, videoRef, skipResume]);
}
