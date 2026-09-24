"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { DeviceKind } from "@/components/system/DeviceProvider";

/** Fullscreen state of the player shell, kept in sync with the document. */
export function useFullscreen({
  shellRef,
  device,
}: {
  shellRef: RefObject<HTMLDivElement | null>;
  device: DeviceKind;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  /** Fullscreen. A phone player is a landscape-first surface, so once we own the
      screen we ask for a landscape lock — only legal while fullscreen, and
      silently unsupported on desktop and iOS. */
  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    };
    if (document.fullscreenElement) {
      orientation?.unlock?.();
      document.exitFullscreen().catch(() => {});
      return;
    }
    shell.requestFullscreen().then(
      () => {
        if (device === "phone") orientation?.lock?.("landscape").catch(() => {});
      },
      () => {}
    );
  }, [device, shellRef]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  return { fullscreen, toggleFullscreen };
}
