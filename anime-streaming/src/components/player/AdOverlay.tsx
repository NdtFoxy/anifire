"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import type { AdSlot } from "./types";
import styles from "./player.module.css";

/**
 * The pre-roll surface: the creative, and the four things Russian law requires to
 * be legible while it plays — the word «Реклама», the advertiser's name, the age
 * marker and the disclaimer. All four are campaign data; nothing is composed
 * here, and a field the server did not send is simply not rendered.
 *
 * It is also a lid. While an ad plays the player underneath must be untouchable:
 * the overlay covers the whole frame above the chrome, carries `data-osd` so the
 * shell's gesture machine treats it as controls rather than picture (no tap-seek,
 * no click-to-play), and PlayerRoot stops feeding it keys. Escape does not close
 * it — there is no way to dismiss a roll except Skip, once the server allows it.
 */

/** A creative that never reaches its first frame must not hold the episode. */
const STALL_MS = 8000;

/**
 * Keys that act on the player or the route, and therefore must not reach it
 * while a roll is on screen. Membership is tested per keystroke, so a Set.
 */
const BLOCKED_KEYS = new Set([
  " ",
  "Enter",
  "k",
  "f",
  "i",
  "m",
  "c",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Escape",
  "Backspace",
  "GoBack",
  "BrowserBack",
  "MediaPlayPause",
  "MediaPlay",
  "MediaPause",
]);

export default function AdOverlay({
  slot,
  tv,
  onStart,
  onProgress,
  onComplete,
  onSkip,
  onClick,
  onFail,
}: {
  slot: AdSlot;
  /** TV: bigger type and the Skip button takes focus so the D-pad can reach it. */
  tv: boolean;
  onStart: () => void;
  onProgress: (positionSec: number) => void;
  onComplete: () => void;
  onSkip: (positionSec: number) => void;
  onClick: (positionSec: number) => void;
  onFail: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  /** Ad head position, the single source for the countdown and the skip gate. */
  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);

  const canSkip = slot.skipAfterSec !== null && elapsed >= slot.skipAfterSec;
  const remaining = Math.max(0, Math.ceil(slot.durationSec - elapsed));
  const pct =
    slot.durationSec > 0
      ? Math.min(100, (elapsed / slot.durationSec) * 100)
      : 0;

  /* A creative that errors or never starts is our problem, not the viewer's:
     hand the frame back and let the episode play. */
  useEffect(() => {
    if (started) return;
    const id = window.setTimeout(onFail, STALL_MS);
    return () => window.clearTimeout(id);
  }, [started, onFail]);

  /* On TV the Skip button is the only thing worth pointing a remote at, so it
     takes focus the moment it exists — PlayerRoot swallows the arrows during a
     roll, which means nothing else could hand it focus. */
  useEffect(() => {
    if (tv && canSkip) skipRef.current?.focus({ preventScroll: true });
  }, [tv, canSkip]);

  const handlePlaying = useCallback(() => {
    setStarted(true);
    onStart();
  }, [onStart]);

  const handleTime = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setElapsed(v.currentTime);
    onProgress(v.currentTime);
  }, [onProgress]);

  const handleSkip = useCallback(
    (e: React.MouseEvent) => {
      // The whole frame may be a click-through to the advertiser; skipping is a
      // rejection, and must never be billed as interest.
      e.stopPropagation();
      onSkip(videoRef.current?.currentTime ?? elapsed);
    },
    [onSkip, elapsed]
  );

  const clickUrl = slot.clickUrl;
  const handleFrameClick = useCallback(() => {
    if (!clickUrl) return;
    onClick(videoRef.current?.currentTime ?? 0);
    window.open(clickUrl, "_blank", "noopener,noreferrer");
  }, [clickUrl, onClick]);

  /* The app's keyboard maps would seek, pause, minimize or navigate straight
     through an ad: PlayerRoot owns space/arrows/f/i/m/c and SpatialNav turns
     Escape into router.back(). PlayerRoot bails while a roll is live; this
     listener stops the rest. Only these keys are swallowed — reload, devtools
     and tab switching are none of an advertiser's business — and Space/Enter
     aimed at the Skip button pass through, because that is how it is pressed. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!BLOCKED_KEYS.has(e.key)) return;
      const inside = rootRef.current?.contains(e.target as Node) ?? false;
      if (inside && (e.key === " " || e.key === "Enter")) return;
      // SpatialNav and PlayerRoot both bail on a defaultPrevented key; capture
      // phase plus stopPropagation covers listeners that do not.
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      ref={rootRef}
      className={styles.adOverlay}
      data-osd
      data-ad-overlay
      data-clickable={clickUrl ? "true" : undefined}
      role={clickUrl ? "link" : "presentation"}
      tabIndex={clickUrl ? 0 : undefined}
      aria-label={
        clickUrl ? `Реклама, ${slot.advertiser} — перейти на сайт` : undefined
      }
      onClick={clickUrl ? handleFrameClick : undefined}
      onKeyDown={
        clickUrl
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") handleFrameClick();
            }
          : undefined
      }
    >
      <video
        ref={videoRef}
        className={styles.adVideo}
        src={slot.src}
        autoPlay
        playsInline
        // Never a native control strip: seeking a pre-roll is the one thing the
        // viewer must not be able to do.
        controls={false}
        onPlaying={handlePlaying}
        onTimeUpdate={handleTime}
        onEnded={onComplete}
        onError={onFail}
      />

      {/* Legal block. «Реклама» and the advertiser are on screen for the whole
          roll — they are not a hover, a tooltip or a first-seconds badge. */}
      <div className={styles.adLegal}>
        <p className={styles.adMark}>
          <span className={styles.adLabel}>{slot.label}</span>
          <span className={styles.adDot} aria-hidden="true">
            ·
          </span>
          <span className={styles.adAdvertiser}>{slot.advertiser}</span>
          {slot.ageRating !== null ? (
            <span className={styles.adAge}>{slot.ageRating}+</span>
          ) : null}
        </p>
        {slot.disclaimer ? (
          <p className={styles.adDisclaimer}>{slot.disclaimer}</p>
        ) : null}
      </div>

      <div className={styles.adCountdown} role="timer" aria-live="off">
        Осталось {remaining} с
      </div>

      {canSkip ? (
        <button
          ref={skipRef}
          type="button"
          className={styles.adSkip}
          onClick={handleSkip}
          data-tap
        >
          Пропустить
          <SkipForward size={16} />
        </button>
      ) : slot.skipAfterSec !== null ? (
        <p className={styles.adSkipWait}>
          Пропуск через {Math.max(0, Math.ceil(slot.skipAfterSec - elapsed))} с
        </p>
      ) : null}

      <div className={styles.adProgress} aria-hidden="true">
        <div className={styles.adProgressFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
