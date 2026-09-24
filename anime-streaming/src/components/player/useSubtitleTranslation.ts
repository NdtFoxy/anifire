"use client";

import { useCallback, useState } from "react";
import { fetchTranslatedTrack } from "@/data/animeApi";
import type {
  PlayerSettings,
  PlayerSource,
  SubtitleSelection,
  SubtitleTrack,
} from "./types";

/**
 * On-demand LLM subtitle translation requested from the settings menu. Only
 * catalogue-backed episodes (AniList or MAL id plus an episode number) can be
 * translated; the new track is merged into the source and shown immediately.
 */
export function useSubtitleTranslation({
  source,
  selection,
  mergeTracks,
  update,
}: {
  source: PlayerSource | null;
  selection: SubtitleSelection;
  mergeTracks: (tracks: SubtitleTrack[]) => void;
  update: (patch: Partial<PlayerSettings>) => void;
}) {
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const canTranslate = (!!source?.anilistId || !!source?.malId) && source?.episode != null;
  const requestLanguage = useCallback(
    async (lang: string) => {
      const q = lang.trim();
      if (!q || (!source?.anilistId && !source?.malId) || source.episode == null) return;
      setTranslatingLang(q);
      try {
        const track = await fetchTranslatedTrack(
          { anilistId: source.anilistId, malId: source.malId, episode: source.episode },
          q
        );
        if (track) {
          mergeTracks([track]);
          // Show it right away: fill primary if empty, else the secondary slot.
          update({
            selection: selection.primary
              ? { ...selection, secondary: track.id }
              : { ...selection, primary: track.id },
          });
        }
      } finally {
        setTranslatingLang(null);
      }
    },
    [source?.anilistId, source?.malId, source?.episode, mergeTracks, update, selection]
  );

  return { translatingLang, canTranslate, requestLanguage };
}
