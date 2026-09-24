"use client";

// First client import at the root: runtime polyfills for old TV browsers.
import "@/lib/polyfills";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Device + input-modality detection, published as `data-device` / `data-input`
 * on <html> so CSS can adapt without guessing from viewport width alone.
 *
 *  - `device`  what the page is rendered on: phone | tablet | desktop | tv.
 *              TV is decided by user agent (smart-TV platforms) or an explicit
 *              user override — never by resolution, because a 4K monitor sits
 *              50cm from your face and a 1080p TV sits three metres away.
 *  - `input`   how the user is driving it right now: pointer | touch | remote.
 *              This flips live: touching a laptop trackpad after using arrows
 *              switches back to pointer, and vice versa.
 */

export type DeviceKind = "phone" | "tablet" | "desktop" | "tv";
export type InputKind = "pointer" | "touch" | "remote";

interface DeviceValue {
  device: DeviceKind;
  input: InputKind;
  /** True while the 10-foot layout is active (detected or forced). */
  tv: boolean;
  /** Manual override, persisted — lets anyone test or force the couch layout. */
  setTvOverride: (on: boolean | null) => void;
  tvOverride: boolean | null;
}

const OVERRIDE_KEY = "anifire.device.tv";

/** Keys a TV remote / D-pad emits. Pressing one means "no pointer in play". */
const REMOTE_KEYS: Record<string, true> = {
  ArrowUp: true,
  ArrowDown: true,
  ArrowLeft: true,
  ArrowRight: true,
  Enter: true,
  GoBack: true,
  BrowserBack: true,
  MediaPlayPause: true,
  ColorF0Red: true,
  ColorF1Green: true,
};

const DeviceContext = createContext<DeviceValue>({
  device: "desktop",
  input: "pointer",
  tv: false,
  setTvOverride: () => {},
  tvOverride: null,
});

/** Smart-TV and set-top-box user agents. Kept narrow on purpose. */
const TV_UA =
  /\b(smart-?tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast|nettv|viera|aquos|bravia|crkey|tizen|web0s|webos|dtv|philipstv|inettvbrowser|aft[bmst]|android tv|large screen)\b/i;

function detectTv(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (TV_UA.test(ua)) return true;
  // Android TV reports "Android" without "Mobile" and has no touch points.
  if (/android/i.test(ua) && !/mobile/i.test(ua) && navigator.maxTouchPoints === 0) {
    return window.matchMedia("(min-width: 1280px)").matches;
  }
  return false;
}

function detectDevice(tv: boolean): DeviceKind {
  if (tv) return "tv";
  const w = window.innerWidth;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (w <= 599) return "phone";
  if (w <= 1023 || (coarse && w <= 1366)) return "tablet";
  return "desktop";
}

/**
 * The persisted override, read during state initialisation instead of from an
 * effect so the first classification already knows about it. No storage on the
 * server, so this starts as `null` there.
 */
function readOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* storage disabled — detection still works */
  }
  return null;
}

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe: the server seeds `null`, and the only consumer of
  // `tvOverride` (TvModeToggle) lives inside a menu that starts closed, so the
  // stored value is never rendered during hydration — it only feeds the
  // classification below, which is client-only anyway.
  const [tvOverride, setOverride] = useState<boolean | null>(readOverride);
  const [device, setDevice] = useState<DeviceKind>("desktop");
  // What the last real input event told us, or null while the user has not
  // touched, clicked or pressed anything yet.
  const [inputSignal, setInputSignal] = useState<InputKind | null>(null);

  // Modality is derived, never stored: a TV is always remote-driven, and until
  // the first event arrives a phone or tablet is assumed finger-driven rather
  // than defaulting to a mouse.
  const input: InputKind =
    device === "tv"
      ? "remote"
      : (inputSignal ?? (device === "phone" || device === "tablet" ? "touch" : "pointer"));

  useEffect(() => {
    const classify = () => {
      const tv = tvOverride ?? detectTv();
      setDevice(detectDevice(tv));
    };
    classify();
    window.addEventListener("resize", classify, { passive: true });
    window.addEventListener("orientationchange", classify);
    return () => {
      window.removeEventListener("resize", classify);
      window.removeEventListener("orientationchange", classify);
    };
  }, [tvOverride]);

  // Input modality. Directional keys mean a remote or a keyboard driver; a
  // pointer event means hands are back on a mouse/finger.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (REMOTE_KEYS[e.key]) setInputSignal("remote");
    };
    const onPointer = (e: PointerEvent) => {
      setInputSignal(e.pointerType === "touch" || e.pointerType === "pen" ? "touch" : "pointer");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  // Publish to <html> for CSS.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.device = device;
    root.dataset.input = input;
  }, [device, input]);

  const value = useMemo<DeviceValue>(
    () => ({
      device,
      input,
      tv: device === "tv",
      tvOverride,
      setTvOverride: (on) => {
        setOverride(on);
        try {
          if (on === null) window.localStorage.removeItem(OVERRIDE_KEY);
          else window.localStorage.setItem(OVERRIDE_KEY, on ? "1" : "0");
        } catch {
          /* non-fatal */
        }
      },
    }),
    [device, input, tvOverride]
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice(): DeviceValue {
  return useContext(DeviceContext);
}
