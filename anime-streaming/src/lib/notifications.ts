"use client";

import { authFetch } from "@/lib/auth-client";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const BASE = `${API_BASE}/api/v1/me/notifications`;

export interface NotificationItem {
  id: number;
  kind: "NEW_EPISODE";
  animeId: number;
  animeTitle: string;
  episode: number;
  createdAt: string;
  read: boolean;
}

export interface Inbox {
  unread: number;
  items: NotificationItem[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchUnreadCount(): Promise<number> {
  const body = await json<{ unread: number }>(await authFetch(`${BASE}/unread-count`));
  return body.unread;
}

export async function fetchInbox(): Promise<Inbox> {
  return json<Inbox>(await authFetch(BASE));
}

export async function markAllRead(): Promise<void> {
  await json(await authFetch(`${BASE}/read`, { method: "POST" }));
}

export async function fetchEpisodeEmails(): Promise<boolean> {
  return (await json<{ episodeEmails: boolean }>(await authFetch(`${BASE}/settings`))).episodeEmails;
}

export async function setEpisodeEmails(episodeEmails: boolean): Promise<boolean> {
  const res = await authFetch(`${BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ episodeEmails }),
  });
  return (await json<{ episodeEmails: boolean }>(res)).episodeEmails;
}
