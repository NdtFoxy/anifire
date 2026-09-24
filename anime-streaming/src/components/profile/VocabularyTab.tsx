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
  NEW: "новое",
  LEARNING: "изучаю",
  KNOWN: "знаю",
  IGNORED: "скрыто",
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

  if (error) return <ErrorState message="Не удалось загрузить словарь." onRetry={() => load()} />;
  if (!loaded && !stats) return <Skeleton />;

  // No language chosen yet — offer the picker instead of an empty list.
  if (!lang) {
    return (
      <div className={styles.vocabWrap}>
        <EmptyState icon={<GraduationCap size={22} />} title="Выберите язык для изучения">
          Слова, на которые вы нажимаете в субтитрах, попадают сюда вместе со сценой, где они
          встретились. Выберите язык, и плеер начнёт их подсвечивать.
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
            Знаю до уровня
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
            <BookOpen size={14} /> Слова<b>{stats.total}</b>
          </span>
          <span>
            <Sparkles size={14} /> Изучаю<b>{stats.learning}</b>
          </span>
          <span>
            <GraduationCap size={14} /> Знаю<b>{stats.known}</b>
          </span>
          <span>
            <Flame size={14} /> Повторено сегодня<b>{stats.reviewedToday}</b>
          </span>
          <span>
            Точность (7 дн.)<b>{stats.reviewed7d ? `${stats.accuracy7d}%` : "—"}</b>
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
          {stats?.dueNow ? `Повторить (${stats.dueNow})` : "Сейчас нечего повторять"}
        </button>
        <div className={styles.filterChips}>
          {(["ALL", "LEARNING", "KNOWN"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-on={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "ALL" ? "Все" : STATUS_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="Слов пока нет">
          Нажмите на подсвеченное слово во время просмотра с субтитрами на этом языке, и оно
          появится здесь вместе с репликой, где встретилось.
        </EmptyState>
      ) : (
        <ul className={styles.wordList}>
          {visible.map((word) => (
            <li key={`${word.lang}-${word.lemma}`} data-status={word.status}>
              <div className={styles.wordHead}>
                <b>{word.lemma}</b>
                {word.reading && word.reading !== word.lemma ? <em>{word.reading}</em> : null}
                {word.surface && word.surface !== word.lemma ? (
                  <em>встречено как {word.surface}</em>
                ) : null}
                <span className={styles.wordStatus} data-status={word.status}>
                  {STATUS_LABEL[word.status]}
                </span>
              </div>
              {word.gloss ? <p className={styles.wordGloss}>{word.gloss}</p> : null}
              {word.contextLine ? <p className={styles.wordContext}>{word.contextLine}</p> : null}
              <div className={styles.wordFoot}>
                <span>встречено {word.timesSeen}×</span>
                {word.animeKey && word.timeSec !== null ? (
                  <Link
                    href={`/watch/${word.animeKey}?t=${word.timeSec}${word.episode ? `&ep=${word.episode}` : ""}`}
                  >
                    <Play size={12} /> серия {word.episode} · {formatTime(word.timeSec)}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* JMdict is CC BY-SA 4.0: crediting it is a licence condition, not a courtesy. */}
      <p className={styles.vocabCredit}>
        Значения японских слов из{" "}
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
