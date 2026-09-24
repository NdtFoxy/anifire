"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Flame, GraduationCap, Loader2, Play, Sparkles } from "lucide-react";
import ReviewSession from "./ReviewSession";
import { EmptyState, ErrorState, Skeleton } from "./states";
import {
  fetchDue,
  fetchLanguages,
  fetchMyWords,
  fetchStudyStats,
  setLanguage,
  type ReviewCard,
  type StudyStats,
  type UserLanguage,
  type UserWord,
} from "@/lib/study";
import styles from "@/app/profile/profile.module.css";

/**
 * The learner's own dictionary.
 *
 * Every entry keeps the line and the second where the word was met, so the list
 * is not flashcards but memories with a link back into the episode. Reviews are
 * scheduled by the backend; this screen just shows what is due and records how
 * it went.
 */

const LANGS = [
  { code: "ja", label: "日本語" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "en", label: "English" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  NEW: "new",
  LEARNING: "learning",
  KNOWN: "known",
  IGNORED: "ignored",
};

export default function VocabularyTab() {
  const [languages, setLanguages] = useState<UserLanguage[]>([]);
  const [lang, setLang] = useState<string | null>(null);
  const [words, setWords] = useState<UserWord[]>([]);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [filter, setFilter] = useState<"ALL" | "LEARNING" | "KNOWN">("ALL");
  const [session, setSession] = useState<ReviewCard[] | null>(null);
  /** Flipped once the first answer (or failure) is in, never from the effect body. */
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // A promise chain, not async/await: every state write happens in a callback,
  // so the mount effect below never writes state synchronously.
  const load = useCallback(
    (code?: string) =>
      fetchLanguages()
        .then((list) => {
          setLanguages(list);
          const learning = list.find((l) => l.role === "LEARNING");
          const active = code ?? lang ?? learning?.lang ?? null;
          setLang(active);
          setError(false);
          if (!active) return;
          return Promise.all([fetchMyWords(active), fetchStudyStats(active)]).then(
            ([myWords, myStats]) => {
              setWords(myWords);
              setStats(myStats);
            }
          );
        })
        .catch(() => setError(true))
        .finally(() => setLoaded(true)),
    [lang]
  );

  useEffect(() => {
    void load();
    // Deliberately once: switching language calls load(code) explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorState message="Could not load your vocabulary." onRetry={() => load()} />;
  if (!loaded && !stats) return <Skeleton />;

  // No language chosen yet — offer the picker instead of an empty list.
  if (!lang) {
    return (
      <div className={styles.vocabWrap}>
        <EmptyState icon={<GraduationCap size={22} />} title="Pick a language to learn">
          Words you tap in the subtitles land here, together with the scene they came
          from. Choose what you are learning and the player starts highlighting.
        </EmptyState>
        <div className={styles.langPicker}>
          {LANGS.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={async () => {
                await setLanguage(option.code, "LEARNING", 2);
                await load(option.code);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <ReviewSession
        lang={lang}
        cards={session}
        onFinished={async () => {
          setSession(null);
          await load(lang);
        }}
      />
    );
  }

  const visible = words.filter((word) => filter === "ALL" || word.status === filter);
  const current = languages.find((l) => l.lang === lang);

  return (
    <div className={styles.vocabWrap}>
      <header className={styles.vocabHead}>
        <div className={styles.langTabs}>
          {languages.map((option) => (
            <button
              key={option.lang}
              type="button"
              data-on={option.lang === lang}
              onClick={() => load(option.lang)}
            >
              {LANGS.find((l) => l.code === option.lang)?.label ?? option.lang}
            </button>
          ))}
        </div>
        {current ? (
          <label className={styles.levelPicker}>
            Known up to level
            <select
              value={current.level}
              onChange={async (e) => {
                await setLanguage(lang, "LEARNING", Number(e.target.value));
                await load(lang);
              }}
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {stats ? (
        <div className={styles.vocabStats}>
          <span>
            <BookOpen size={14} /> Words<b>{stats.total}</b>
          </span>
          <span>
            <Sparkles size={14} /> Learning<b>{stats.learning}</b>
          </span>
          <span>
            <GraduationCap size={14} /> Known<b>{stats.known}</b>
          </span>
          <span>
            <Flame size={14} /> Reviewed today<b>{stats.reviewedToday}</b>
          </span>
          <span>
            Accuracy (7d)<b>{stats.reviewed7d ? `${stats.accuracy7d}%` : "—"}</b>
          </span>
        </div>
      ) : null}

      <div className={styles.vocabActions}>
        <button
          type="button"
          className={styles.reviewStart}
          disabled={!stats?.dueNow}
          onClick={async () => {
            const cards = await fetchDue(lang, 20);
            if (cards.length) setSession(cards);
          }}
        >
          {!loaded ? <Loader2 size={16} className={styles.spin} /> : <Play size={16} />}
          {stats?.dueNow ? `Review ${stats.dueNow} due` : "Nothing due right now"}
        </button>
        <div className={styles.filterChips}>
          {(["ALL", "LEARNING", "KNOWN"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-on={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "ALL" ? "All" : STATUS_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="No words yet">
          Tap a highlighted word while watching with subtitles in this language and it
          will appear here with the line it came from.
        </EmptyState>
      ) : (
        <ul className={styles.wordList}>
          {visible.map((word) => (
            <li key={`${word.lang}-${word.lemma}`} data-status={word.status}>
              <div className={styles.wordHead}>
                <b>{word.lemma}</b>
                {word.reading && word.reading !== word.lemma ? <em>{word.reading}</em> : null}
                {word.surface && word.surface !== word.lemma ? (
                  <em>seen as {word.surface}</em>
                ) : null}
                <span className={styles.wordStatus} data-status={word.status}>
                  {STATUS_LABEL[word.status]}
                </span>
              </div>
              {word.gloss ? <p className={styles.wordGloss}>{word.gloss}</p> : null}
              {word.contextLine ? <p className={styles.wordContext}>{word.contextLine}</p> : null}
              <div className={styles.wordFoot}>
                <span>seen {word.timesSeen}×</span>
                {word.animeKey && word.timeSec !== null ? (
                  <Link
                    href={`/watch/${word.animeKey}?t=${word.timeSec}${word.episode ? `&ep=${word.episode}` : ""}`}
                  >
                    <Play size={12} /> episode {word.episode} · {formatTime(word.timeSec)}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* JMdict is CC BY-SA 4.0: crediting it is a licence condition, not a courtesy. */}
      <p className={styles.vocabCredit}>
        Japanese meanings from{" "}
        <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noreferrer">
          JMdict
        </a>{" "}
        (EDRDG), CC BY-SA 4.0.
      </p>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
