"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * React's mirror of the one <video> element: play state, position, length and
 * buffer, plus the two ways the player moves the head.
 *
 * `timeupdate` is too coarse for a smooth scrubber and cue timing, so while
 * playing the position is also sampled every animation frame.
 */
export function useMediaState({
  videoRef,
  sourceKey,
  playbackRate,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The <video> only exists while a source does, so listeners re-bind per source. */
  sourceKey: string | undefined;
  playbackRate: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => setDuration(v.duration || 0);
    const onProgress = () => {
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onPlay = () => setPlaying(true);
    // load() on a playing element pauses it without a "pause" event; "emptied"
    // is what it fires, so treat that as paused too (else the button says Pause).
    const onPause = () => setPlaying(false);
    const onTime = () => setTime(v.currentTime);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("durationchange", onLoaded);
    v.addEventListener("progress", onProgress);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("emptied", onPause);
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("durationchange", onLoaded);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("emptied", onPause);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [sourceKey, videoRef]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const v = videoRef.current;
      if (v) setTime(v.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const mediaDuration =
        Number.isFinite(duration) && duration > 0
          ? duration
          : Number.isFinite(v.duration) && v.duration > 0
            ? v.duration
            : Number.POSITIVE_INFINITY;
      const clamped = Math.max(
        0,
        mediaDuration === Number.POSITIVE_INFINITY ? t : Math.min(t, mediaDuration)
      );
      v.currentTime = clamped;
      setTime(clamped);
    },
    [duration, videoRef]
  );

  /** Relative seek with no chrome side-effects — what touch double-tap wants. */
  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      seekTo(v.currentTime + delta);
    },
    [seekTo, videoRef]
  );

  return { playing, time, duration, buffered, seekTo, seekBy };
}
