"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendAdEvent, type AdEvent } from "@/lib/ads";
import type { AdSlot, PlayerSource } from "./types";

/**
 * Pre-roll state machine.
 *
 *   idle ──begin()──► playing ──complete()/skip()/fail()──► done
 *     │
 *     └─ no slot in the plan ──────────────────────────────► done
 *
 * `idle` waits for the viewer's play intent instead of starting on its own: the
 * episode does not autoplay either, and an unmuted <video> that nobody asked for
 * is blocked by every browser's autoplay policy. The press that would have
 * started the episode starts the ad, and that gesture is what lets it play aloud.
 *
 * `done` is terminal and per source: once a roll has run for a `source.key` it
 * must never run again for it. The player re-opens the same source on a quality
 * or subtitle change (a new `activeSrc`, a re-`open()` with richer tracks), and
 * without this memory every settings change would cost the viewer another ad.
 */
export type AdState = "idle" | "playing" | "done";

/**
 * Keys whose pre-roll has already been paid. Module scope rather than a ref, so
 * it also survives a remount of the player tree — a viewer who navigates away
 * and straight back into the same episode has already watched the ad.
 */
const played = new Set<string>();

export interface AdPlanController {
  state: AdState;
  /** The creative to render; non-null only while `state === "playing"`. */
  slot: AdSlot | null;
  /**
   * Hand the play intent to the pre-roll. Returns true when the ad took over and
   * the caller must NOT start the episode.
   */
  begin: () => boolean;
  /** First frame actually on screen → START. */
  started: () => void;
  /** Ad `timeupdate` → quartiles. */
  progress: (positionSec: number) => void;
  /** Ad ended on its own → COMPLETE, then the episode. */
  complete: () => void;
  /** Skip pressed → SKIP, then the episode. */
  skip: (positionSec: number) => void;
  /** Creative clicked → CLICK. Does not end the roll. */
  click: (positionSec: number) => void;
  /**
   * The creative cannot play (network, codec, blocked autoplay). No event exists
   * for it in the contract: we report nothing and get out of the way, because a
   * broken ad must never cost the viewer their episode.
   */
  fail: () => void;
}

/** Quartile marks, in play order. */
const QUARTILES: ReadonlyArray<{ at: number; event: AdEvent }> = [
  { at: 0.25, event: "Q25" },
  { at: 0.5, event: "Q50" },
  { at: 0.75, event: "Q75" },
];

/**
 * @param source the currently loaded playback source, or null
 * @param onFinished called once when a roll that actually played is over, so the
 *   player can resume the episode wherever its own resume logic left the head
 */
export function useAdPlan(
  source: PlayerSource | null,
  onFinished?: () => void
): AdPlanController {
  const key = source?.key ?? null;

  /**
   * The one slot this playback owes. Only PREROLL is honoured; the array shape
   * is kept because mid-rolls are the same decision with a different `kind`.
   */
  const slot = useMemo<AdSlot | null>(() => {
    const slots = source?.adPlan?.slots;
    if (!slots?.length) return null;
    return slots.find((s) => s.kind === "PREROLL") ?? null;
  }, [source?.adPlan]);

  const [rolling, setRolling] = useState<AdSlot | null>(null);

  /**
   * The roll currently owed an event stream. It mirrors `rolling` but is written
   * only from effect events, so a burst of element callbacks inside one tick
   * cannot report against a slot that `end` already closed.
   */
  const liveRef = useRef<AdSlot | null>(null);

  /** Events already reported for the live slot — each fires exactly once. */
  const sentRef = useRef<{ decisionId: string; events: Set<AdEvent> }>({
    decisionId: "",
    events: new Set(),
  });

  /** Latest callback, refreshed from an effect so `end` can stay stable. */
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  const report = useCallback((event: AdEvent, positionSec: number) => {
    const live = liveRef.current;
    if (!live) return;
    const sent = sentRef.current;
    if (sent.decisionId !== live.decisionId) {
      sent.decisionId = live.decisionId;
      sent.events = new Set();
    }
    if (sent.events.has(event)) return;
    sent.events.add(event);
    sendAdEvent(live.decisionId, event, positionSec);
  }, []);

  const state: AdState = rolling
    ? "playing"
    : slot && key && !played.has(key)
      ? "idle"
      : "done";

  const begin = useCallback(() => {
    if (!slot || !key || played.has(key) || liveRef.current) return false;
    liveRef.current = slot;
    setRolling(slot);
    return true;
  }, [slot, key]);

  /** One exit door for every way a roll can end, so `played` can never be missed. */
  const end = useCallback(() => {
    if (!liveRef.current) return;
    if (key) played.add(key);
    liveRef.current = null;
    setRolling(null);
    finishedRef.current?.();
  }, [key]);

  const started = useCallback(() => report("START", 0), [report]);

  const progress = useCallback((positionSec: number) => {
    const live = liveRef.current;
    if (!live) return;
    // The contract's own duration drives the quartiles, not the element's:
    // a creative whose container lies about its length must still be counted
    // against what the advertiser was sold.
    const total = live.durationSec;
    if (!(total > 0)) return;
    const ratio = positionSec / total;
    for (const q of QUARTILES) {
      if (ratio >= q.at) report(q.event, positionSec);
    }
  }, [report]);

  const complete = useCallback(() => {
    const live = liveRef.current;
    if (!live) return;
    // A completed roll reports the full length even if the element stopped a
    // frame short of it.
    report("COMPLETE", live.durationSec);
    end();
  }, [report, end]);

  const skip = useCallback(
    (positionSec: number) => {
      report("SKIP", positionSec);
      end();
    },
    [report, end]
  );

  const click = useCallback(
    (positionSec: number) => report("CLICK", positionSec),
    [report]
  );

  // A stable controller: the player keeps it in callback deps, and a fresh object
  // every render would re-register its keyboard listener on every state change.
  return useMemo(
    () => ({
      state,
      slot: rolling,
      begin,
      started,
      progress,
      complete,
      skip,
      click,
      fail: end,
    }),
    [state, rolling, begin, started, progress, complete, skip, click, end]
  );
}
