"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isChrome } from "./osd";
import type { HudState } from "./useHud";

/** Touch double-tap seek, matching every mobile player's muscle memory. */
const TAP_SEEK_STEP = 10;
const DOUBLE_TAP_MS = 300;
/** Below this the finger is still "a tap", above it the drag owns the gesture. */
const DRAG_SLOP = 12;
/** A press held longer than this is a finger resting, not a tap. */
const LONG_PRESS_MS = 700;
/** How long the ∓10s double-tap ripple stays on screen. */
const RIPPLE_MS = 520;
/** A full vertical drag spans 60% of the picture — one comfortable thumb. */
const DRAG_SWING = 0.6;
/** Emulated screen brightness (a CSS filter, not the real backlight). */
const BRIGHT_MIN = 0.25;
const BRIGHT_MAX = 1.6;

/** Which third of the picture a tap landed in. */
type TapZone = "left" | "mid" | "right";

/**
 * Touch gestures (full mode).
 *
 * One pointer machine owns every finger interaction, so no gesture is handled
 * twice and none of them can fight the OSD:
 *   single tap             → toggles the OSD. It must NEVER toggle playback —
 *                            that was the bug: the shell's onClick called
 *                            togglePlay() for taps as well as mouse clicks, so
 *                            reaching for the controls paused the episode.
 *   double tap outer third → seeks ∓TAP_SEEK_STEP with a ripple on that side.
 *   double tap centre      → play/pause, the deliberate way to stop on a phone.
 *   vertical drag, right   → volume; left → brightness (a CSS filter). Both
 *                            report in the centre HUD, never in the OSD.
 * Presses that land on [data-osd] chrome are left alone: those buttons own
 * their own clicks. Mouse and pen keep desktop click-to-play via onShellClick.
 */
export function useTouchGestures({
  muted,
  volume,
  changeVolume,
  flashHud,
  togglePlay,
  seekBy,
  controls,
  showControls,
  dismissControls,
  settingsOpen,
  setSettingsOpen,
}: {
  muted: boolean;
  volume: number;
  changeVolume: (value: number) => void;
  flashHud: (kind: HudState["kind"], value: number) => void;
  togglePlay: () => void;
  seekBy: (delta: number) => void;
  controls: boolean;
  showControls: () => void;
  dismissControls: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}) {
  /** Which pointer kind opened the current interaction. A touch tap must never
      fall through to the desktop click-to-play handler. */
  const pointerKindRef = useRef<string>("mouse");
  /** The live touch gesture. One record drives tap, double-tap and drag, so the
      three can never fire twice for the same finger. */
  const gestureRef = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    width: number;
    height: number;
    at: number;
    axis: "undecided" | "tap" | "volume" | "brightness";
    baseVolume: number;
    baseBrightness: number;
  } | null>(null);
  /** Previous tap, for double-tap detection inside the same third. */
  const lastTapRef = useRef<{ at: number; zone: TapZone } | null>(null);
  /** Bumped per ripple so React remounts the element and replays the animation. */
  const rippleSeq = useRef(0);
  const rippleTimer = useRef<number | null>(null);

  /** Double-tap seek feedback: which third was hit and how far it jumped. */
  const [ripple, setRipple] = useState<{
    side: "left" | "right";
    seconds: number;
    id: number;
  } | null>(null);
  /** Screen brightness emulated as a CSS filter (phone left-half drag). */
  const [brightness, setBrightness] = useState(1);

  const flashRipple = useCallback((side: "left" | "right", seconds: number) => {
    rippleSeq.current += 1;
    setRipple({ side, seconds, id: rippleSeq.current });
    if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    rippleTimer.current = window.setTimeout(() => setRipple(null), RIPPLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    },
    []
  );

  const onShellPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerKindRef.current = e.pointerType;
      if (e.pointerType !== "touch" || isChrome(e.target)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      gestureRef.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        at: Date.now(),
        axis: "undecided",
        baseVolume: muted ? 0 : volume,
        baseBrightness: brightness,
      };
      // Capture, so a drag that wanders over the control bar still reports here.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [muted, volume, brightness]
  );

  const onShellPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.axis === "undecided") {
        if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
        // Only a clearly vertical move becomes a drag; a sideways smudge stays a
        // tap, so a shaky finger never loses its tap.
        if (Math.abs(dy) <= Math.abs(dx)) {
          g.axis = "tap";
          return;
        }
        g.axis = g.x - g.left < g.width / 2 ? "brightness" : "volume";
      }
      if (g.axis === "tap") return;
      const ratio = -dy / Math.max(1, g.height * DRAG_SWING);
      if (g.axis === "volume") {
        const next = Math.max(0, Math.min(1, g.baseVolume + ratio));
        changeVolume(next);
        flashHud("volume", next);
      } else {
        const span = BRIGHT_MAX - BRIGHT_MIN;
        const next = Math.max(
          BRIGHT_MIN,
          Math.min(BRIGHT_MAX, g.baseBrightness + ratio * span)
        );
        setBrightness(next);
        flashHud("brightness", (next - BRIGHT_MIN) / span);
      }
    },
    [changeVolume, flashHud]
  );

  const onShellPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.id !== e.pointerId) return;
      if (g.axis === "volume" || g.axis === "brightness") return; // drag spent it
      const now = Date.now();
      if (now - g.at > LONG_PRESS_MS) return;

      const offset = e.clientX - g.left;
      const zone: TapZone =
        offset < g.width / 3 ? "left" : offset > (g.width * 2) / 3 ? "right" : "mid";
      const previous = lastTapRef.current;
      const isDouble =
        !!previous && previous.zone === zone && now - previous.at < DOUBLE_TAP_MS;
      lastTapRef.current = isDouble ? null : { at: now, zone };

      if (isDouble) {
        if (zone === "mid") togglePlay();
        else {
          seekBy(zone === "left" ? -TAP_SEEK_STEP : TAP_SEEK_STEP);
          flashRipple(zone, TAP_SEEK_STEP);
        }
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (controls) dismissControls();
      else showControls();
    },
    [
      controls,
      settingsOpen,
      setSettingsOpen,
      showControls,
      dismissControls,
      togglePlay,
      seekBy,
      flashRipple,
    ]
  );

  /** A cancelled pointer (system gesture, call, palm) is not a tap. */
  const onShellPointerCancel = useCallback(() => {
    gestureRef.current = null;
  }, []);

  /** Mouse and pen only: clicking the picture toggles playback, as on every
      desktop player. Touch never reaches this — pointerKindRef gates it. */
  const onShellClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (pointerKindRef.current === "touch" || isChrome(e.target)) return;
      if (settingsOpen) setSettingsOpen(false);
      else togglePlay();
    },
    [settingsOpen, setSettingsOpen, togglePlay]
  );

  /** Browsers synthesize a mousemove after a tap; without this guard it would
      re-open the OSD that the very same tap just closed. */
  const onShellMouseMove = useCallback(() => {
    if (pointerKindRef.current === "touch") return;
    showControls();
  }, [showControls]);

  return {
    ripple,
    brightness,
    onShellPointerDown,
    onShellPointerMove,
    onShellPointerUp,
    onShellPointerCancel,
    onShellClick,
    onShellMouseMove,
  };
}
