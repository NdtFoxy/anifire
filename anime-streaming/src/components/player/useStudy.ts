"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildStudyPack,
  fetchLanguages,
  indexTokens,
  setWordStatus,
  type StudyPack,
  type StudyWord,
  type UserLanguage,
  type WordStatus,
} from "@/lib/study";
import type { SubtitleTrack } from "./types";

/**
 * Vocabulary layer for the player.
 *
 * It only wakes up when the active subtitle track is in a language the viewer is
 * actually learning — otherwise watching costs exactly what it did before. The
 * pack is fetched once per episode; after that everything (which word is hard,
 * which one you already know) is answered from memory while cues fly past.
 */
export interface StudyState {
  active: boolean;
  pack: StudyPack | null;
  /** lineIndex → tokens, for underlining the exact surface form in a cue. */
  tokensByLine: Map<number, { l: number; s: string; m: string }[]>;
  /** lemma → word, including the viewer's own status. */
  wordsByLemma: Map<string, StudyWord>;
  /** Words at or below this level count as already known for this viewer. */
  knownLevel: number;
  mark: (lemma: string, status: WordStatus, context?: {
    line?: string;
    surface?: string;
    timeSec?: number;
  }) => Promise<void>;
}

export function useStudy({
  track,
  animeKey,
  episode,
  enabled,
}: {
  track: SubtitleTrack | null;
  animeKey: string | null;
  episode: number | null;
  enabled: boolean;
}): StudyState {
  const [languages, setLanguages] = useState<UserLanguage[]>([]);
  /**
   * The pack carries the slot it was built for, so switching episode or track
   * drops it during render instead of needing an effect to clear it.
   */
  const [built, setBuilt] = useState<{ slot: string; pack: StudyPack } | null>(
    null
  );
  const [statuses, setStatuses] = useState<Map<string, WordStatus>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchLanguages().then((list) => {
      if (!cancelled) setLanguages(list);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const learning = useMemo(
    () =>
      track
        ? languages.find(
            (l) => l.role === "LEARNING" && l.lang === track.lang.slice(0, 2).toLowerCase()
          )
        : undefined,
    [languages, track]
  );

  const active = Boolean(enabled && learning && track && animeKey && episode !== null);

  const lang = track ? track.lang.slice(0, 2).toLowerCase() : null;
  const slot =
    active && animeKey && episode !== null && lang
      ? `${animeKey}#${episode}#${lang}`
      : null;
  const pack = built && built.slot === slot ? built.pack : null;

  useEffect(() => {
    if (!slot || !track || !animeKey || episode === null || !lang) return;
    let cancelled = false;
    // The cues are already parsed in the browser, so the server never has to
    // fetch or parse the subtitle file again — it only analyses the text.
    const lines = track.cues.map((cue) => cue.text.replace(/\n/g, " ")).slice(0, 5000);
    buildStudyPack({ animeKey, episode, lang, lines }).then((result) => {
      if (cancelled || !result) return;
      setBuilt({ slot, pack: result });
      setStatuses(
        new Map(
          result.words
            .filter((word) => word.status)
            .map((word) => [word.lemma, word.status as WordStatus])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [slot, track, animeKey, episode, lang]);

  const tokensByLine = useMemo(() => indexTokens(pack), [pack]);

  const wordsByLemma = useMemo(() => {
    const map = new Map<string, StudyWord>();
    for (const word of pack?.words ?? []) {
      map.set(word.lemma, { ...word, status: statuses.get(word.lemma) ?? word.status });
    }
    return map;
  }, [pack, statuses]);

  const mark = useCallback(
    async (
      lemma: string,
      status: WordStatus,
      context?: { line?: string; surface?: string; timeSec?: number }
    ) => {
      if (!pack) return;
      // Optimistic: the highlight must change under the finger, not after a round trip.
      setStatuses((cur) => new Map(cur).set(lemma, status));
      // The dictionary entry travels with the word: the vocabulary list and the
      // review card must stay readable without re-fetching the pack.
      const word = wordsByLemma.get(lemma);
      const saved = await setWordStatus(pack.lang, lemma, {
        status,
        surface: context?.surface,
        reading: word?.reading ?? undefined,
        gloss: word?.gloss ?? undefined,
        contextLine: context?.line,
        animeKey: pack.animeKey,
        episode: pack.episode,
        timeSec: context?.timeSec === undefined ? undefined : Math.round(context.timeSec),
      });
      if (!saved) {
        setStatuses((cur) => {
          const next = new Map(cur);
          next.delete(lemma);
          return next;
        });
      }
    },
    [pack, wordsByLemma]
  );

  return {
    active,
    pack,
    tokensByLine,
    wordsByLemma,
    knownLevel: learning?.level ?? pack?.knownLevel ?? 1,
    mark,
  };
}
