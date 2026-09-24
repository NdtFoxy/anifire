"use client";

import { useRef, useState } from "react";
import type { Chapter } from "./types";
import styles from "./player.module.css";

/**
 * Full-mode seek slider: buffered range, hover preview, elapsed fill and
 * intro/outro chapter ticks. Click seeks to the pointer's position.
 */
export default function ProgressBar({
  pct,
  bufPct,
  duration,
  chapters,
  onSeek,
}: {
  pct: number;
  bufPct: number;
  duration: number;
  chapters: Chapter[];
  onSeek: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const ratioFromEvent = (clientX: number) => {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  return (
    <div
      ref={barRef}
      className={styles.progress}
      role="slider"
      aria-label="Перемотка"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round((pct / 100) * duration)}
      tabIndex={0}
      onMouseMove={(e) => setHoverPct(ratioFromEvent(e.clientX) * 100)}
      onMouseLeave={() => setHoverPct(null)}
      onClick={(e) => onSeek(ratioFromEvent(e.clientX) * duration)}
    >
      <div className={styles.progressTrack}>
        <div className={styles.progressBuffer} style={{ width: `${bufPct}%` }} />
        {hoverPct !== null && (
          <div className={styles.progressHover} style={{ width: `${hoverPct}%` }} />
        )}
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        {duration > 0 &&
          chapters.map((c, i) => (
            <span
              key={i}
              className={`${styles.chapterTick} ${styles[c.kind] ?? ""}`}
              style={{
                left: `${(c.start / duration) * 100}%`,
                width: `${((c.end - c.start) / duration) * 100}%`,
              }}
              title={c.label ?? c.kind}
            />
          ))}
      </div>
      <span className={styles.progressKnob} style={{ left: `${pct}%` }} />
    </div>
  );
}
