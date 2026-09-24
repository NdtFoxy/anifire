"use client";

import { API_BASE } from "@/lib/auth-client";

/**
 * Ad telemetry. One call, one direction: the client reports what the viewer did
 * with a creative the *server* decided to show.
 *
 * The events are the money: an impression that never arrives is an impression
 * nobody gets paid for, and the moments most worth reporting (COMPLETE, SKIP)
 * are exactly the ones where the viewer is already leaving — closing the tab,
 * backing out of the episode, switching apps. `navigator.sendBeacon` is the only
 * transport the browser promises to finish after the document is gone, so it is
 * the first choice; `keepalive` fetch is the fallback for engines without it and
 * for the case where the beacon queue is full.
 *
 * Nothing here is allowed to be load-bearing for playback: every failure is
 * swallowed, nothing is awaited by the player, and there are no retries of our
 * own. The server dedupes on (decisionId, event), so the browser's single retry
 * is harmless and a lost event is cheaper than a stalled pre-roll.
 */

const EVENTS = `${API_BASE}/api/v1/ads/events`;

/** Quartiles are the industry vocabulary; the server speaks the same set. */
export type AdEvent =
  | "START"
  | "Q25"
  | "Q50"
  | "Q75"
  | "COMPLETE"
  | "SKIP"
  | "CLICK";

/**
 * Reports one event for one server-issued decision. Fire-and-forget by design:
 * callers must not await it and it never throws.
 */
export function sendAdEvent(
  decisionId: string,
  event: AdEvent,
  positionSec: number
): void {
  if (!decisionId || typeof window === "undefined") return;
  const body = JSON.stringify({
    decisionId,
    event,
    // Whole seconds: the server stores a position, not a timing measurement.
    positionSec: Math.max(0, Math.round(positionSec)),
  });

  try {
    if (typeof navigator.sendBeacon === "function") {
      // The Blob type is what makes this arrive as JSON; a bare string would be
      // sent as text/plain and the endpoint would reject it.
      const queued = navigator.sendBeacon(
        EVENTS,
        new Blob([body], { type: "application/json" })
      );
      if (queued) return;
    }
  } catch {
    /* beacon unavailable or refused — fall through to fetch */
  }

  try {
    void fetch(EVENTS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* offline / blocked — an ad event is never worth surfacing */
    });
  } catch {
    /* fetch itself unavailable — give up silently */
  }
}
