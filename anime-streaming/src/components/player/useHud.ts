"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HUD_HIDE = 900;

export interface HudState {
  kind: "volume" | "brightness";
  value: number;
}

/** Transient centre HUD for volume/brightness gestures and D-pad volume. */
export function useHud() {
  const [hud, setHud] = useState<HudState | null>(null);
  const hudTimer = useRef<number | null>(null);

  /** Centre HUD flash — feedback for gestures/D-pad that must NOT open the OSD. */
  const flashHud = useCallback((kind: HudState["kind"], value: number) => {
    setHud({ kind, value });
    if (hudTimer.current) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHud(null), HUD_HIDE);
  }, []);

  useEffect(
    () => () => {
      if (hudTimer.current) window.clearTimeout(hudTimer.current);
    },
    []
  );

  return { hud, flashHud };
}
