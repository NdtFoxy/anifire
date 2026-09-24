"use client";

import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { submitReview, type ReviewCard } from "@/lib/study";
import styles from "@/app/profile/profile.module.css";

/**
 * A review round.
 *
 * The prompt is a real line from an episode the learner watched, with the word
 * blanked out — recall is anchored to a scene, not to a bare flashcard. Answering
 * is two steps on purpose: guess first, then grade yourself. Self-grading is what
 * makes spaced repetition work; asking only "right or wrong" throws away the
 * difference between "instantly" and "barely".
 */
export default function ReviewSession({
  lang,
  cards,
  onFinished,
}: {
  lang: string;
  cards: ReviewCard[];
  onFinished: (reviewed: number) => void;
}) {
  /**
   * One state per card: advancing the index resets the reveal, the pick and the
   * timer in the same update, so no effect has to chase the index.
   */
  const [turn, setTurn] = useState(() => ({
    index: 0,
    revealed: false,
    picked: null as string | null,
    startedAt: Date.now(),
  }));
  const { index, revealed, picked, startedAt } = turn;

  const card = cards[index];
  const progress = Math.round((index / Math.max(1, cards.length)) * 100);

  if (!card) return null;

  const grade = async (value: 0 | 1 | 2 | 3) => {
    await submitReview(lang, card.lemma, value, Date.now() - startedAt);
    if (index + 1 >= cards.length) onFinished(cards.length);
    else
      setTurn({
        index: index + 1,
        revealed: false,
        picked: null,
        startedAt: Date.now(),
      });
  };

  return (
    <div className={styles.reviewCard}>
      <div className={styles.reviewProgress}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className={styles.reviewCount}>
        {index + 1} / {cards.length}
      </p>

      <p className={styles.reviewPrompt}>{card.prompt}</p>

      {!revealed ? (
        <>
          <div className={styles.reviewOptions}>
            {card.options.map((option) => (
              <button
                key={option}
                type="button"
                data-picked={picked === option}
                data-correct={picked !== null && option === card.answer}
                onClick={() =>
                  setTurn((cur) => ({ ...cur, picked: option, revealed: true }))
                }
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.reviewReveal}
            onClick={() => setTurn((cur) => ({ ...cur, revealed: true }))}
          >
            Show the answer
          </button>
        </>
      ) : (
        <>
          <p className={styles.reviewAnswer}>
            {card.answer}
            {card.reading && card.reading !== card.answer ? <em> · {card.reading}</em> : null}
            {card.surface !== card.answer ? <em> · seen as {card.surface}</em> : null}
            {picked ? (
              picked === card.answer ? (
                <span data-tone="ok">
                  <Check size={14} /> correct
                </span>
              ) : (
                <span data-tone="bad">
                  <X size={14} /> you picked {picked}
                </span>
              )
            ) : null}
          </p>

          {card.gloss ? <p className={styles.reviewGloss}>{card.gloss}</p> : null}

          {card.animeKey && card.timeSec !== null ? (
            <a
              className={styles.reviewScene}
              href={`/watch/${card.animeKey}?t=${card.timeSec}${card.episode ? `&ep=${card.episode}` : ""}`}
            >
              <RotateCcw size={14} /> Watch the scene again
            </a>
          ) : null}

          <div className={styles.reviewGrades}>
            <button type="button" data-grade="0" onClick={() => grade(0)}>
              Again
            </button>
            <button type="button" data-grade="1" onClick={() => grade(1)}>
              Hard
            </button>
            <button type="button" data-grade="2" onClick={() => grade(2)}>
              Good
            </button>
            <button type="button" data-grade="3" onClick={() => grade(3)}>
              Easy
            </button>
          </div>
        </>
      )}
    </div>
  );
}
