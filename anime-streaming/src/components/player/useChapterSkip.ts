"use client";

import { useEffect } from "react";
import type { Chapter, PlayerSource } from "./types";

/**
 * Intro/outro handling: jumps past the intro on its own when the viewer asked
 * for that, and otherwise offers the "Skip intro" / "Skip outro" button.
 *
 * @returns the button to show at the current position, or null
 */
export function useChapterSkip({
  source,
  time,
  autoSkipIntro,
  offerButton,
  seekTo,
}: {
  source: PlayerSource | null;
  time: number;
  autoSkipIntro: boolean;
  /** False in the mini player, which never shows the button. */
  offerButton: boolean;
  seekTo: (t: number) => void;
}): { label: string; to: number } | null {
  useEffect(() => {
    if (!autoSkipIntro || !source) return;
    const inIntro = activeChapter(source.chapters, time, "intro");
    if (inIntro && time < inIntro.end - 0.3) seekTo(inIntro.end + 0.5);
  }, [time, autoSkipIntro, source, seekTo]);

  if (!offerButton || !source) return null;
  const intro = activeChapter(source.chapters, time, "intro");
  const outro = activeChapter(source.chapters, time, "outro");
  if (intro) return { label: "Пропустить заставку", to: intro.end + 0.5 };
  if (outro) return { label: "Пропустить титры", to: outro.end + 0.5 };
  return null;
}

function activeChapter(
  chapters: Chapter[],
  time: number,
  kind: Chapter["kind"]
): Chapter | null {
  return (
    chapters.find((c) => c.kind === kind && time >= c.start && time <= c.end) ??
    null
  );
}
