"use client";

import { authFetch } from "@/lib/auth-client";

/**
 * Language-learning layer.
 *
 * A study pack is shared by everyone watching that episode in that language, so
 * the first viewer's request builds it and the rest read it back in milliseconds.
 * Personal state — which words you already know — is a separate, tiny payload.
 */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

export type WordStatus = "NEW" | "LEARNING" | "KNOWN" | "IGNORED";

export interface StudyWord {
  lemma: string;
  surface: string | null;
  pos: string | null;
  zipf: number;
  /** 1 (everyday) … 6 (rare) — comparable across languages. */
  level: number;
  occurrences: number;
  firstLine: number;
  sampleLine: string | null;
  /** Kana reading; null outside Japanese. */
  reading: string | null;
  /** Dictionary meaning in the viewer's own language, when the dictionary has it. */
  gloss: string | null;
  status: WordStatus | null;
}

/** One analysed token: line index, the form as written, and its dictionary form. */
export interface StudyToken {
  l: number;
  s: string;
  m: string;
}

export interface StudyPack {
  animeKey: string;
  episode: number;
  lang: string;
  lineCount: number;
  wordCount: number;
  knownLevel: number;
  words: StudyWord[];
  tokens: string | null;
}

export interface UserLanguage {
  lang: string;
  role: "LEARNING" | "NATIVE";
  level: number;
  known: number;
  learning: number;
}

export interface UserWord {
  lang: string;
  lemma: string;
  surface: string | null;
  reading: string | null;
  gloss: string | null;
  status: WordStatus;
  timesSeen: number;
  note: string | null;
  contextLine: string | null;
  animeKey: string | null;
  episode: number | null;
  timeSec: number | null;
  updatedAt: string;
}

export async function buildStudyPack(input: {
  animeKey: string;
  episode: number;
  lang: string;
  lines: string[];
}): Promise<StudyPack | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/v1/study/packs`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as StudyPack;
  } catch {
    return null;
  }
}

export async function fetchStudyPack(
  animeKey: string,
  episode: number,
  lang: string
): Promise<StudyPack | null> {
  try {
    const res = await authFetch(
      `${API_BASE}/api/v1/study/packs/${encodeURIComponent(animeKey)}/${episode}/${lang}`
    );
    if (res.status === 204 || !res.ok) return null;
    return (await res.json()) as StudyPack;
  } catch {
    return null;
  }
}

export async function fetchLanguages(): Promise<UserLanguage[]> {
  try {
    const res = await authFetch(`${API_BASE}/api/v1/me/languages`);
    if (!res.ok) return [];
    return (await res.json()) as UserLanguage[];
  } catch {
    return [];
  }
}

export async function setLanguage(
  lang: string,
  role: "LEARNING" | "NATIVE",
  level: number
): Promise<void> {
  await authFetch(`${API_BASE}/api/v1/me/languages`, {
    method: "PUT",
    body: JSON.stringify({ lang, role, level }),
  });
}

export async function setWordStatus(
  lang: string,
  lemma: string,
  input: {
    status: WordStatus;
    /** The form as written on screen, so a review prompt can blank it out. */
    surface?: string;
    /** Reading and meaning are copied along, so the list never needs the pack again. */
    reading?: string;
    gloss?: string;
    note?: string;
    contextLine?: string;
    animeKey?: string;
    episode?: number;
    timeSec?: number;
  }
): Promise<UserWord | null> {
  try {
    const res = await authFetch(
      `${API_BASE}/api/v1/me/words/${lang}/${encodeURIComponent(lemma)}`,
      { method: "PUT", body: JSON.stringify(input) }
    );
    if (!res.ok) return null;
    return (await res.json()) as UserWord;
  } catch {
    return null;
  }
}

export async function fetchMyWords(lang: string): Promise<UserWord[]> {
  try {
    const res = await authFetch(`${API_BASE}/api/v1/me/words?lang=${lang}`);
    if (!res.ok) return [];
    return (await res.json()) as UserWord[];
  } catch {
    return [];
  }
}

/**
 * Which lemma each surface form maps to, per subtitle line.
 *
 * Built once per pack so rendering a cue is a map lookup rather than a search:
 * the player re-renders on every timeupdate and cannot afford anything else.
 */
export function indexTokens(pack: StudyPack | null): Map<number, StudyToken[]> {
  const out = new Map<number, StudyToken[]>();
  if (!pack?.tokens) return out;
  try {
    for (const token of JSON.parse(pack.tokens) as StudyToken[]) {
      const line = out.get(token.l);
      if (line) line.push(token);
      else out.set(token.l, [token]);
    }
  } catch {
    /* malformed token blob — highlighting is simply skipped */
  }
  return out;
}


/* ───────────────────────── review sessions ───────────────────────── */

export interface ReviewCard {
  lemma: string;
  surface: string;
  level: number;
  /** The line the word was met in, with the word blanked out. */
  prompt: string;
  answer: string;
  reading: string | null;
  gloss: string | null;
  options: string[];
  animeKey: string | null;
  episode: number | null;
  timeSec: number | null;
  dueAt: string | null;
  reps: number;
}

export interface ReviewResult {
  lemma: string;
  status: WordStatus;
  dueAt: string | null;
  intervalDays: number;
}

export interface StudyStats {
  lang: string;
  total: number;
  learning: number;
  known: number;
  dueNow: number;
  reviewedToday: number;
  reviewed7d: number;
  accuracy7d: number;
  activity: { date: string; count: number }[];
}

export async function fetchDue(lang: string, limit = 20): Promise<ReviewCard[]> {
  try {
    const res = await authFetch(`${API_BASE}/api/v1/me/study/due?lang=${lang}&limit=${limit}`);
    if (!res.ok) return [];
    return (await res.json()) as ReviewCard[];
  } catch {
    return [];
  }
}

/** Grade: 0 again · 1 hard · 2 good · 3 easy. */
export async function submitReview(
  lang: string,
  lemma: string,
  grade: 0 | 1 | 2 | 3,
  elapsedMs?: number
): Promise<ReviewResult | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/v1/me/study/review`, {
      method: "POST",
      body: JSON.stringify({ lang, lemma, grade, elapsedMs }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ReviewResult;
  } catch {
    return null;
  }
}

export async function fetchStudyStats(lang: string): Promise<StudyStats | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/v1/me/study/stats?lang=${lang}`);
    if (!res.ok) return null;
    return (await res.json()) as StudyStats;
  } catch {
    return null;
  }
}
