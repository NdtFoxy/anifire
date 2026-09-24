"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HIDE_DELAY = 2600;
/** A remote user needs longer to read the OSD than a mouse user needs to move. */
const TV_HIDE_DELAY = 4000;
const SCRUB_HIDE = 1400;

/**
 * Visibility of the full-mode chrome: the control bar with its auto-hide timer,
 * the settings menu that pins it open, and the thin scrub bar that replaces it
 * while the keyboard or D-pad seeks.
 */
export function useOsd({
  tv,
  seekBy,
}: {
  tv: boolean;
  seekBy: (delta: number) => void;
}) {
  const [controls, setControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const scrubTimer = useRef<number | null>(null);

  const hideDelay = tv ? TV_HIDE_DELAY : HIDE_DELAY;
  const showControls = useCallback(() => {
    setScrubbing(false);
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!settingsOpen) setControls(false);
    }, hideDelay);
  }, [settingsOpen, hideDelay]);

  /** Hide the bar now and drop the pending auto-hide with it. */
  const dismissControls = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setControls(false);
  }, []);

  /** Keyboard/D-pad seek: swaps the OSD for the thin scrub bar while jumping. */
  const nudge = useCallback(
    (delta: number) => {
      seekBy(delta);
      setControls(false);
      setScrubbing(true);
      if (scrubTimer.current) window.clearTimeout(scrubTimer.current);
      scrubTimer.current = window.setTimeout(() => setScrubbing(false), SCRUB_HIDE);
    },
    [seekBy]
  );

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (scrubTimer.current) window.clearTimeout(scrubTimer.current);
    },
    []
  );

  return {
    controls,
    setControls,
    scrubbing,
    settingsOpen,
    setSettingsOpen,
    showControls,
    dismissControls,
    nudge,
  };
}
