"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  createParty,
  expectedPosition,
  joinParty,
  leaveParty,
  partyLink,
  pushPartyState,
  setActiveParty,
  streamParty,
  useActiveParty,
  type PartyMember,
  type PartyState,
} from "@/lib/party";

/** Drift tolerated before a follower seeks; below it, a seek would stutter more than it fixes. */
const DRIFT_SEC = 1.5;
/** Local media events inside this window after applying remote state are echoes, not intent. */
const ECHO_MS = 900;

/**
 * Keeps the local <video> in step with a watch party and reports this viewer's
 * own play/pause/seek to it. Every member may drive playback (like watching on
 * one couch); the server stamps each change with its author so nobody reacts to
 * their own echo.
 */
export function useWatchParty({
  videoRef,
  slot,
  selfHref,
  userId,
  enabled,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  slot: { animeKey: string; episode: number } | null;
  selfHref: string | null;
  userId: number | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const code = useActiveParty();
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const appliedAt = useRef(0);
  const clockOffset = useRef(0);
  const slotRef = useRef(slot);
  useEffect(() => {
    slotRef.current = slot;
  }, [slot]);

  const apply = useCallback(
    (state: PartyState) => {
      clockOffset.current = Date.parse(state.serverTime) - Date.now();
      setMembers(state.members);
      if (state.by !== null && state.by === userId) return;
      const current = slotRef.current;
      if (current && (state.animeKey !== current.animeKey || state.episode !== current.episode)) {
        router.push(`/watch/${encodeURIComponent(state.animeKey)}?ep=${state.episode}&party=${state.code}`);
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      const sync = () => {
        appliedAt.current = Date.now();
        const target = expectedPosition(state, clockOffset.current);
        if (Math.abs(v.currentTime - target) > DRIFT_SEC) v.currentTime = target;
        if (state.playing && v.paused) v.play().catch(() => {});
        if (!state.playing && !v.paused) v.pause();
      };
      if (v.readyState >= 1) sync();
      else v.addEventListener("loadedmetadata", sync, { once: true });
    },
    [router, userId, videoRef]
  );

  // Join + stream, reconnecting with backoff until the room is left.
  useEffect(() => {
    if (!code || !enabled) return;
    const controller = new AbortController();
    let attempt = 0;
    (async () => {
      try {
        apply(await joinParty(code));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось войти в комнату.");
        setActiveParty(null);
        return;
      }
      while (!controller.signal.aborted) {
        try {
          await streamParty(code, apply, controller.signal);
          attempt = 0;
        } catch {
          if (controller.signal.aborted) return;
          attempt++;
        }
        const { promise, resolve } = Promise.withResolvers<void>();
        const timer = setTimeout(resolve, Math.min(15_000, 1000 * 2 ** attempt));
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
        await promise;
      }
    })();
    return () => controller.abort();
  }, [code, enabled, apply]);

  // Report this viewer's own actions.
  useEffect(() => {
    const v = videoRef.current;
    if (!code || !enabled || !v) return;
    let seekTimer: number | undefined;
    const report = () => {
      const current = slotRef.current;
      if (!current || Date.now() - appliedAt.current < ECHO_MS) return;
      pushPartyState(code, {
        playing: !v.paused,
        position: v.currentTime,
        episode: current.episode,
        animeKey: current.animeKey,
      }).catch(() => {});
    };
    const onSeeked = () => {
      window.clearTimeout(seekTimer);
      seekTimer = window.setTimeout(report, 250);
    };
    v.addEventListener("play", report);
    v.addEventListener("pause", report);
    v.addEventListener("seeked", onSeeked);
    return () => {
      window.clearTimeout(seekTimer);
      v.removeEventListener("play", report);
      v.removeEventListener("pause", report);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [code, enabled, videoRef]);

  /** Opens a room for the current episode and returns the invite link. */
  const start = useCallback(async (): Promise<string | null> => {
    const v = videoRef.current;
    if (!slot || !selfHref) return null;
    try {
      const state = await createParty(slot.animeKey, slot.episode, v?.currentTime ?? 0, !!v && !v.paused && !v.ended);
      setMembers(state.members);
      setError(null);
      setActiveParty(state.code);
      return partyLink(selfHref, state.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать комнату.");
      return null;
    }
  }, [slot, selfHref, videoRef]);

  const leave = useCallback(() => {
    if (code) void leaveParty(code);
    setActiveParty(null);
    setMembers([]);
  }, [code]);

  const link = code && selfHref ? partyLink(selfHref, code) : null;
  return { code, members, error, link, start, leave };
}
