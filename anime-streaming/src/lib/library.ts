"use client";

import { authFetch } from "@/lib/auth-client";

/**
 * Server-side library: resume positions, bookmarks and friends.
 *
 * These live on the account rather than in localStorage, so a phone and a TV
 * agree on where an episode stopped. The device copy is kept only as an offline
 * cache and is reconciled by timestamp — never treated as the truth.
 */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const ME = `${API_BASE}/api/v1/me`;

export interface WatchProgress {
  animeKey: string;
  animeTitle: string | null;
  episode: number;
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  provider: string | null;
  updatedAt: string;
}

export interface Bookmark {
  animeId: number;
  title: string;
  imageUrl: string | null;
  rating: number | null;
  createdAt: string;
}

export interface Friend {
  friendshipId: number;
  userId: number | null;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";
  incoming: boolean;
  since: string;
}

export interface FriendOverview {
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}

/* ───────────────────────── progress ───────────────────────── */

export interface ProgressInput {
  animeKey: string;
  animeTitle?: string | null;
  episode: number;
  positionSeconds: number;
  durationSeconds?: number | null;
  provider?: string | null;
}

/**
 * Sends a heartbeat. `keepalive` matters: the most valuable save is the one
 * fired while the tab is closing, and a normal fetch is cancelled at that point.
 * (sendBeacon cannot carry the Authorization header, so keepalive is the tool.)
 */
export async function saveProgress(input: ProgressInput): Promise<void> {
  try {
    await authFetch(`${ME}/progress`, {
      method: "PUT",
      body: JSON.stringify({
        animeKey: input.animeKey,
        animeTitle: input.animeTitle ?? null,
        episode: input.episode,
        positionSeconds: Math.max(0, Math.round(input.positionSeconds)),
        durationSeconds: input.durationSeconds ? Math.round(input.durationSeconds) : null,
        provider: input.provider ?? null,
      }),
      keepalive: true,
    });
  } catch {
    /* offline — the local cache below still holds the position */
  }
}

export async function fetchProgress(
  animeKey: string,
  episode: number
): Promise<WatchProgress | null> {
  try {
    const res = await authFetch(`${ME}/progress/${encodeURIComponent(animeKey)}/${episode}`);
    if (res.status === 204 || !res.ok) return null;
    return (await res.json()) as WatchProgress;
  } catch {
    return null;
  }
}

export async function fetchContinueWatching(limit = 20): Promise<WatchProgress[]> {
  try {
    const res = await authFetch(`${ME}/progress?limit=${limit}`);
    if (!res.ok) return [];
    return (await res.json()) as WatchProgress[];
  } catch {
    return [];
  }
}

/* ───────────── local mirror, for offline and instant reads ───────────── */

const LOCAL_KEY = "anifire.progress.v1";

interface LocalEntry {
  positionSeconds: number;
  durationSeconds: number | null;
  updatedAt: number;
}

function localAll(): Record<string, LocalEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "{}") as Record<string, LocalEntry>;
  } catch {
    return {};
  }
}

export function slotKey(animeKey: string, episode: number): string {
  return `${animeKey}#${episode}`;
}

export function readLocalProgress(animeKey: string, episode: number): LocalEntry | null {
  return localAll()[slotKey(animeKey, episode)] ?? null;
}

export function writeLocalProgress(
  animeKey: string,
  episode: number,
  positionSeconds: number,
  durationSeconds: number | null
): void {
  if (typeof window === "undefined") return;
  try {
    const all = localAll();
    all[slotKey(animeKey, episode)] = {
      positionSeconds: Math.round(positionSeconds),
      durationSeconds: durationSeconds ? Math.round(durationSeconds) : null,
      updatedAt: Date.now(),
    };
    // Keep the mirror small: only the 200 most recent slots survive.
    const entries = Object.entries(all).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 200);
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage disabled — the server copy is still authoritative */
  }
}

/**
 * Resume point for a slot: whichever of the server and device copies was written
 * last. A device that watched offline therefore still wins until it syncs.
 */
export async function resolveResume(
  animeKey: string,
  episode: number
): Promise<{ positionSeconds: number; completed: boolean } | null> {
  const [remote, local] = [await fetchProgress(animeKey, episode), readLocalProgress(animeKey, episode)];
  if (!remote && !local) return null;
  if (!remote) return { positionSeconds: local!.positionSeconds, completed: false };
  if (!local) return { positionSeconds: remote.positionSeconds, completed: remote.completed };
  const remoteNewer = new Date(remote.updatedAt).getTime() >= local.updatedAt;
  return remoteNewer
    ? { positionSeconds: remote.positionSeconds, completed: remote.completed }
    : { positionSeconds: local.positionSeconds, completed: false };
}

/* ───────────────────────── bookmarks ───────────────────────── */

export async function fetchBookmarks(): Promise<Bookmark[]> {
  try {
    const res = await authFetch(`${ME}/bookmarks`);
    if (!res.ok) return [];
    return (await res.json()) as Bookmark[];
  } catch {
    return [];
  }
}

export async function addBookmark(animeId: number): Promise<boolean> {
  const res = await authFetch(`${ME}/bookmarks/${animeId}`, { method: "PUT" });
  return res.ok;
}

export async function removeBookmark(animeId: number): Promise<boolean> {
  const res = await authFetch(`${ME}/bookmarks/${animeId}`, { method: "DELETE" });
  return res.ok;
}

/** Uploads a device-local list once, then returns the merged server list. */
export async function mergeBookmarks(animeIds: number[]): Promise<Bookmark[]> {
  const res = await authFetch(`${ME}/bookmarks/merge`, {
    method: "POST",
    body: JSON.stringify({ animeIds }),
  });
  if (!res.ok) return [];
  return (await res.json()) as Bookmark[];
}

/* ───────────────────────── friends ───────────────────────── */

export async function fetchFriends(): Promise<FriendOverview> {
  try {
    const res = await authFetch(`${ME}/friends`);
    if (!res.ok) return { friends: [], incoming: [], outgoing: [] };
    return (await res.json()) as FriendOverview;
  } catch {
    return { friends: [], incoming: [], outgoing: [] };
  }
}

export interface FriendActivity {
  userId: number;
  displayName: string | null;
  avatarUrl: string | null;
  animeKey: string;
  animeTitle: string | null;
  episode: number;
  watchedAt: string;
}

/** What friends watched lately; an error is surfaced, not hidden as "nothing". */
export async function fetchFriendFeed(): Promise<FriendActivity[]> {
  const res = await authFetch(`${ME}/friends/feed`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as FriendActivity[];
}

export async function requestFriend(email: string): Promise<Friend> {
  const res = await authFetch(`${ME}/friends/requests`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? "Не удалось отправить заявку.");
  return body as Friend;
}

export async function answerFriendRequest(
  friendshipId: number,
  accept: boolean
): Promise<void> {
  await authFetch(`${ME}/friends/requests/${friendshipId}/${accept ? "accept" : "decline"}`, {
    method: "POST",
  });
}

export async function removeFriend(userId: number): Promise<void> {
  await authFetch(`${ME}/friends/${userId}`, { method: "DELETE" });
}

export async function blockUser(userId: number): Promise<void> {
  await authFetch(`${ME}/friends/${userId}/block`, { method: "POST" });
}
