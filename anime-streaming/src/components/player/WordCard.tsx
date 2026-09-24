"use client";

import { BookmarkPlus, Check, EyeOff, X } from "lucide-react";
import type { LineToken } from "./SubtitleLine";
import type { WordStatus } from "@/lib/study";
import styles from "./player.module.css";

/**
 * The card shown when a learner taps a highlighted word.
 *
 * It answers three questions and nothing else: what is the dictionary form, how
 * rare is it, and what do I want to do with it. Playback pauses while it is open
 * — reading a definition over moving subtitles is how you lose both.
 */
export default function WordCard({
  token,
  line,
  translation,
  onMark,
  onClose,
}: {
  token: LineToken;
  line: string;
  /** The same moment on the secondary track, when the viewer has one enabled. */
  translation?: string | null;
  onMark: (status: WordStatus) => void;
  onClose: () => void;
}) {
  const level = token.word?.level ?? 0;
  const occurrences = token.word?.occurrences ?? 1;
  const reading = token.word?.reading ?? null;
  const gloss = token.word?.gloss ?? null;

  return (
    <div className={styles.wordCard} role="dialog" aria-label={`Слово ${token.lemma}`}>
      <header>
        <div>
          <b>{token.lemma}</b>
          {reading && reading !== token.lemma ? <em>{reading}</em> : null}
          {token.surface !== token.lemma ? <em>в тексте: {token.surface}</em> : null}
        </div>
        <span className={styles.wordLevel} data-level={level}>
          уровень {level}
        </span>
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <X size={15} />
        </button>
      </header>

      {gloss ? (
        <p className={styles.wordGloss}>{gloss}</p>
      ) : (
        // No dictionary entry: the sentence in a language they read is still a
        // usable answer, so say what is missing instead of showing a blank box.
        <p className={styles.wordGlossMissing}>Нет в словаре — посмотрите значение в строке ниже.</p>
      )}

      <p className={styles.wordLine}>{line}</p>
      {translation ? <p className={styles.wordTranslation}>{translation}</p> : null}

      <p className={styles.wordMeta}>
        {token.word?.pos ? `${token.word.pos} · ` : ""}
        встречается в этой серии: {occurrences}×
      </p>

      <div className={styles.wordActions}>
        <button type="button" onClick={() => onMark("LEARNING")}>
          <BookmarkPlus size={15} /> Изучаю
        </button>
        <button type="button" onClick={() => onMark("KNOWN")}>
          <Check size={15} /> Знаю
        </button>
        <button type="button" onClick={() => onMark("IGNORED")}>
          <EyeOff size={15} /> Пропустить
        </button>
      </div>
    </div>
  );
}
