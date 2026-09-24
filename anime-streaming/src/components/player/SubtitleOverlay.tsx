"use client";

import { useMemo } from "react";
import { cueAt } from "@/lib/subtitles";
import type { StudyState } from "./useStudy";
import type { PlayerSettings, SubtitleTrack } from "./types";
import SubtitleLine, { type LineToken } from "./SubtitleLine";
import styles from "./player.module.css";

/**
 * Dual-subtitle renderer. The secondary track sits on the upper line, the
 * primary on the lower line, each styled independently.
 */
export default function SubtitleOverlay({
  tracks,
  settings,
  time,
  lift,
  basisPx,
  minPx,
  maxPx,
  study,
  onWord,
}: {
  tracks: SubtitleTrack[];
  settings: PlayerSettings;
  time: number;
  /**
   * Extra bottom offset as a CSS length, so the caller can clear the control bar
   * AND the home indicator with the shared tokens
   * (`calc(var(--safe-bottom) + var(--osd-h))`) instead of a guessed pixel count.
   */
  lift: string;
  /** Height of the surface, for proportional font sizing. */
  basisPx: number;
  /** Floor/ceiling for the computed size — a landscape phone needs the floor. */
  minPx?: number;
  maxPx?: number;
  /** Vocabulary layer; inert unless the primary track is a language being learnt. */
  study?: StudyState;
  onWord?: (token: LineToken, line: string) => void;
}) {
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const primary = settings.selection.primary
    ? byId.get(settings.selection.primary)
    : null;
  const secondary = settings.selection.secondary
    ? byId.get(settings.selection.secondary)
    : null;

  // Which cue index is on screen: the study pack is keyed by line number, which
  // is exactly the cue's position in the track it was built from.
  const primaryIndex = useMemo(() => {
    if (!primary) return -1;
    const cue = cueAt(primary.cues, time);
    return cue ? primary.cues.indexOf(cue) : -1;
  }, [primary, time]);

  const studyTokens: LineToken[] | undefined = useMemo(() => {
    if (!study?.active || primaryIndex < 0) return undefined;
    const raw = study.tokensByLine.get(primaryIndex);
    if (!raw) return undefined;
    return raw.map((token) => ({
      surface: token.s,
      lemma: token.m,
      word: study.wordsByLemma.get(token.m),
    }));
  }, [study, primaryIndex]);

  const primaryText = primary ? cueAt(primary.cues, time)?.text : undefined;
  const secondaryText = secondary
    ? cueAt(secondary.cues, time)?.text
    : undefined;

  if (!primaryText && !secondaryText) return null;

  return (
    <div
      className={styles.subtitleLayer}
      style={{ bottom: `calc(${settings.subtitlePosition}% + ${lift})` }}
    >
      {secondaryText ? (
        <SubtitleLine
          text={secondaryText}
          style={settings.secondaryStyle}
          basisPx={basisPx}
          minPx={minPx}
          maxPx={maxPx}
        />
      ) : null}
      {primaryText ? (
        <SubtitleLine
          text={primaryText}
          style={settings.primaryStyle}
          basisPx={basisPx}
          minPx={minPx}
          maxPx={maxPx}
          tokens={studyTokens}
          knownLevel={study?.knownLevel ?? 0}
          onWord={(token) => onWord?.(token, primaryText)}
        />
      ) : null}
    </div>
  );
}
