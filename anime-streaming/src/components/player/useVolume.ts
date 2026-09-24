"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { HudState } from "./useHud";

/** The viewer's volume and mute, mirrored onto the <video>. */
export function useVolume({
  videoRef,
  adRunning,
  flashHud,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Forces the episode silent without touching the viewer's own mute state. */
  adRunning: boolean;
  flashHud: (kind: HudState["kind"], value: number) => void;
}) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      // Silent for the whole roll; the viewer's own mute state returns with it.
      v.muted = muted || adRunning;
    }
  }, [volume, muted, adRunning, videoRef]);

  const changeVolume = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(1, value));
      setVolume(next);
      setMuted(next === 0);
    },
    []
  );

  /** Volume step that reports itself in the HUD instead of opening the OSD. */
  const bumpVolume = useCallback(
    (delta: number) => {
      setVolume((v) => {
        const next = Math.max(0, Math.min(1, v + delta));
        setMuted(next === 0);
        flashHud("volume", next);
        return next;
      });
    },
    [flashHud]
  );

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  return { volume, muted, changeVolume, bumpVolume, toggleMute };
}
