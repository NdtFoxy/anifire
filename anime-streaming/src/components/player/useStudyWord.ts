"use client";

import { useCallback, useState, type RefObject } from "react";
import { cueAt } from "@/lib/subtitles";
import type { WordStatus } from "@/lib/study";
import type { LineToken } from "./SubtitleLine";
import type { PlayerSource } from "./types";
import type { StudyState } from "./useStudy";

export interface StudyWord {
  token: LineToken;
  line: string;
  translation: string | null;
}

/** The word card opened by tapping a word in the primary subtitle line. */
export function useStudyWord({
  videoRef,
  source,
  secondaryTrackId,
  time,
  study,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  source: PlayerSource | null;
  secondaryTrackId: string | null;
  /** Fallback position when the element is gone. */
  time: number;
  study: StudyState;
}) {
  const [studyWord, setStudyWord] = useState<StudyWord | null>(null);

  const openWord = useCallback(
    (token: LineToken, line: string) => {
      // Reading a definition over moving subtitles loses both — pause first.
      videoRef.current?.pause();
      // The same moment on the secondary track is the sentence translated by
      // a human. It costs nothing here: the cue is already loaded and the
      // timestamps line up, which is exactly why the pair is worth showing.
      const other = secondaryTrackId
        ? source?.tracks?.find((t) => t.id === secondaryTrackId)
        : undefined;
      const parallel = other ? cueAt(other.cues, videoRef.current?.currentTime ?? time)?.text : null;
      setStudyWord({ token, line, translation: parallel ?? null });
    },
    [videoRef, secondaryTrackId, source, time]
  );

  const markWord = useCallback(
    (status: WordStatus) => {
      if (!studyWord) return;
      void study.mark(studyWord.token.lemma, status, {
        line: studyWord.line,
        surface: studyWord.token.surface,
        timeSec: videoRef.current?.currentTime,
      });
      setStudyWord(null);
    },
    [studyWord, study, videoRef]
  );

  const closeWord = useCallback(() => setStudyWord(null), []);

  return { studyWord, openWord, markWord, closeWord };
}
