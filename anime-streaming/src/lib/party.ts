"use client";

import { useSyncExternalStore } from "react";
import { authFetch } from "@/lib/auth-client";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const BASE = `${API_BASE}/api/v1/parties`;

export interface PartyMember {
  userId: number;
  displayName: string;
}

export interface PartyState {
  code: string;
  animeKey: string;
  episode: number;
  hostId: number;
  members: PartyMember[];
  playing: boolean;
  position: number;
  at: string;
  by: number | null;
  serverTime: string;
}

async function call(path: string, body?: unknown): Promise<PartyState> {
  const res = await authFetch(`${BASE}${path}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? "Не удалось связаться с комнатой.");
  }
  return (await res.json()) as PartyState;
}

export const createParty = (animeKey: string, episode: number, position: number) =>
  call("", { animeKey, episode, position });
export const joinParty = (code: string) => call(`/${encodeURIComponent(code)}/join`);
export const pushPartyState = (
  code: string,
  state: { playing: boolean; position: number; episode: number; animeKey: string }
) => call(`/${encodeURIComponent(code)}/state`, state);

export async function leaveParty(code: string): Promise<void> {
  await authFetch(`${BASE}/${encodeURIComponent(code)}/leave`, { method: "POST" }).catch(() => {});
}

/**
 * Server-sent events over fetch (EventSource cannot send the Authorization
 * header). Resolves when the stream ends; the caller decides whether to retry.
 */
export async function streamParty(
  code: string,
  onState: (state: PartyState) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await authFetch(`${BASE}/${encodeURIComponent(code)}/events`, {
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let split: number;
    while ((split = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split).replace(/^\r?\n\r?\n/, "");
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onState(JSON.parse(data) as PartyState);
    }
  }
}

/** Where the room says playback is right now, extrapolated from its last event. */
export function expectedPosition(state: PartyState, clockOffsetMs: number): number {
  if (!state.playing) return state.position;
  const elapsed = (Date.now() + clockOffsetMs - Date.parse(state.at)) / 1000;
  return state.position + Math.max(0, elapsed);
}

/* ─────────────── active room (one per tab), shared by page and player ─────────────── */

let activeCode: string | null = null;
const listeners = new Set<() => void>();

export function setActiveParty(code: string | null): void {
  if (code === activeCode) return;
  activeCode = code;
  listeners.forEach((l) => l());
}

export function useActiveParty(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => activeCode,
    () => null
  );
}

export function partyLink(selfHref: string, code: string): string {
  const url = new URL(selfHref, window.location.origin);
  url.searchParams.set("party", code);
  return url.toString();
}
