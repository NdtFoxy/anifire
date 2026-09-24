"use client";

import type { CSSProperties } from "react";
import type { StudyWord } from "@/lib/study";
import type { SubtitleStyle } from "./types";
import styles from "./player.module.css";

/** A token the learner may care about, resolved against the study pack. */
export interface LineToken {
  surface: string;
  lemma: string;
  word?: StudyWord;
}

/**
 * One styled subtitle line. Font size scales with `basisPx` (the height of the
 * surface it sits on) so the same settings look right in the full player, the
 * mini window, and the settings preview.
 */
export default function SubtitleLine({
  text,
  style,
  basisPx,
  minPx = 11,
  maxPx = 64,
  tokens,
  knownLevel = 0,
  onWord,
}: {
  text: string;
  style: SubtitleStyle;
  basisPx: number;
  /** Readability floor: a phone in landscape is only ~390px tall, so the
      proportional size alone would land around 11px. */
  minPx?: number;
  maxPx?: number;
  /** Study tokens for this cue; when absent the line renders exactly as before. */
  tokens?: LineToken[];
  /** Words at or below this level are treated as known and left unmarked. */
  knownLevel?: number;
  onWord?: (token: LineToken) => void;
}) {
  const px = Math.max(minPx, Math.min(maxPx, (style.fontSize / 1080) * basisPx));
  const css: CSSProperties = {
    fontSize: `${px}px`,
    color: style.color,
    opacity: style.opacity,
    fontWeight: style.weight,
    fontFamily: style.fontFamily,
    background:
      style.background > 0 ? `rgba(0,0,0,${style.background})` : "transparent",
    textShadow:
      style.edge === "shadow"
        ? "0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)"
        : "none",
    WebkitTextStroke:
      style.edge === "outline" ? "1px rgba(0,0,0,0.85)" : undefined,
  };
  const rows = text.split("\n");
  const marked = tokens && tokens.length > 0;

  return (
    <p className={styles.subtitleLine} style={css} data-study={marked || undefined}>
      {rows.map((line, i) => (
        <span key={i} className={styles.subtitleRow}>
          {marked ? highlight(line, tokens!, knownLevel, onWord) : line}
        </span>
      ))}
    </p>
  );
}

/**
 * Splits a subtitle line into plain text and clickable word spans.
 *
 * Matching walks the line left to right looking for each token's surface form,
 * which keeps the original characters intact — important for Japanese, where a
 * reconstructed line would lose spacing and punctuation the studio chose. A word
 * the viewer already knows (by level or by their own marking) is left untouched:
 * highlighting everything highlights nothing.
 */
function highlight(
  line: string,
  tokens: LineToken[],
  knownLevel: number,
  onWord?: (token: LineToken) => void
) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const token of tokens) {
    if (!token.surface) continue;
    const at = line.indexOf(token.surface, cursor);
    if (at < 0) continue;

    const status = token.word?.status ?? null;
    const level = token.word?.level ?? 0;
    const interesting = status === "LEARNING" || (status !== "KNOWN" && status !== "IGNORED" && level > knownLevel);
    if (!interesting) continue;

    if (at > cursor) parts.push(line.slice(cursor, at));
    parts.push(
      <button
        key={`w${key++}`}
        type="button"
        className={styles.studyWord}
        data-level={level}
        data-status={status ?? "NEW"}
        onClick={(e) => {
          e.stopPropagation();
          onWord?.(token);
        }}
      >
        {token.surface}
      </button>
    );
    cursor = at + token.surface.length;
  }

  if (cursor === 0) return line;
  if (cursor < line.length) parts.push(line.slice(cursor));
  return parts;
}
