"use client";

import { useEffect, useRef } from "react";

const SEEK_STEP = 5;
/** Remotes are coarse: a couch seek moves in bigger jumps than a keyboard. */
const TV_SEEK_STEP = 10;

/**
 * Keyboard / D-pad shortcuts (full mode only).
 *
 * INPUT-MODE STATE MACHINE
 * ────────────────────────
 *   pointer / keyboard (desktop)  → unchanged parity: space·k play, ←→ seek 5s,
 *                                   ↑↓ volume, f fullscreen, m mute, c subs,
 *                                   i mini, Escape closes the settings menu.
 *
 *   remote (TV or anyone driving a D-pad) → two sub-states:
 *     A. OSD HIDDEN  — the *player* owns the arrows. ←/→ seek ∓TV_SEEK_STEP with
 *        hold-to-repeat acceleration, ↑/↓ change volume with a transient HUD,
 *        Enter/MediaPlayPause toggles play, Back/Escape exits fullscreen or
 *        drops to the mini player. Every one of those calls preventDefault(),
 *        and SpatialNav bails on `event.defaultPrevented`, so focus never moves
 *        — no double handling. Any other remote key wakes the OSD.
 *     B. OSD OPEN    — the *OSD* owns the arrows. We deliberately do NOT call
 *        preventDefault for direction keys, so SpatialNav walks focus between
 *        the OSD buttons and Enter clicks the focused one; we only refresh the
 *        auto-hide timer. Back/Escape closes the menu, then the OSD.
 *
 * The listener is registered in the CAPTURE phase so this switch is decided
 * before SpatialNav's bubble-phase handler ever sees the key, regardless of
 * which component mounted first.
 */
export function usePlayerKeyboard({
  enabled,
  isRemote,
  controls,
  setControls,
  settingsOpen,
  setSettingsOpen,
  volume,
  togglePlay,
  showControls,
  nudge,
  changeVolume,
  bumpVolume,
  toggleMute,
  toggleSubs,
  toggleFullscreen,
  goMini,
}: {
  /** Full mode with no pre-roll running: a roll owns the keyboard (AdOverlay). */
  enabled: boolean;
  /** D-pad driven surface: a real TV, or anyone currently pressing arrows on one. */
  isRemote: boolean;
  controls: boolean;
  setControls: (visible: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  volume: number;
  togglePlay: () => void;
  showControls: () => void;
  nudge: (delta: number) => void;
  changeVolume: (value: number) => void;
  bumpVolume: (delta: number) => void;
  toggleMute: () => void;
  toggleSubs: () => void;
  toggleFullscreen: () => void;
  goMini: () => void;
}) {
  /** Autorepeat accumulator so a held D-pad direction accelerates. */
  const holdRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });

  useEffect(() => {
    // A roll owns the keyboard: AdOverlay swallows the keys that would seek,
    // pause or navigate out of an ad the advertiser has already been sold.
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable)
        return;

      if (isRemote) {
        // Transport keys work in both sub-states.
        if (e.key === "MediaPlayPause" || e.key === "MediaPlay" || e.key === "MediaPause") {
          e.preventDefault();
          togglePlay();
          showControls();
          return;
        }
        if (
          e.key === "Escape" ||
          e.key === "GoBack" ||
          e.key === "BrowserBack" ||
          e.key === "Backspace"
        ) {
          e.preventDefault();
          if (settingsOpen) setSettingsOpen(false);
          else if (controls) setControls(false);
          else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else goMini();
          return;
        }

        // ── B. OSD open: hands the arrows to SpatialNav. ──
        if (controls || settingsOpen) {
          showControls(); // any input keeps the bar alive
          return;
        }

        // ── A. OSD hidden: the player owns the D-pad. ──
        const hold = holdRef.current;
        if (hold.key === e.key) hold.count += 1;
        else holdRef.current = { key: e.key, count: 0 };
        // Accelerate a held direction: 10s → 20s → 30s, capped at 60s a press.
        const step = Math.min(TV_SEEK_STEP * (1 + Math.floor(holdRef.current.count / 4)), 60);

        switch (e.key) {
          case "ArrowRight":
            e.preventDefault();
            nudge(step);
            return;
          case "ArrowLeft":
            e.preventDefault();
            nudge(-step);
            return;
          case "ArrowUp":
            e.preventDefault();
            bumpVolume(0.05);
            return;
          case "ArrowDown":
            e.preventDefault();
            bumpVolume(-0.05);
            return;
          case "Enter":
          case " ":
            e.preventDefault();
            togglePlay();
            showControls();
            return;
          default:
            // "reappears on any remote key"
            showControls();
            return;
        }
      }

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          showControls();
          break;
        case "ArrowRight":
          e.preventDefault();
          nudge(SEEK_STEP);
          break;
        case "ArrowLeft":
          e.preventDefault();
          nudge(-SEEK_STEP);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(volume + 0.1);
          showControls();
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(volume - 0.1);
          showControls();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "i":
          goMini();
          break;
        case "m":
          toggleMute();
          showControls();
          break;
        case "c":
          toggleSubs();
          showControls();
          break;
        case "Escape":
          setSettingsOpen(false);
          break;
        default:
          break;
      }
    };
    const onKeyUp = () => {
      holdRef.current = { key: "", count: 0 };
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [
    enabled,
    isRemote,
    controls,
    setControls,
    settingsOpen,
    setSettingsOpen,
    togglePlay,
    nudge,
    changeVolume,
    bumpVolume,
    volume,
    toggleMute,
    toggleSubs,
    toggleFullscreen,
    showControls,
    goMini,
  ]);
}
