"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDevice } from "./DeviceProvider";

/**
 * D-pad / arrow-key navigation for TV remotes.
 *
 * Browsers only move focus with Tab, which a remote does not have. This walks
 * the geometry instead: from the focused element, pick the nearest focusable
 * whose centre lies in the pressed direction, scoring straight-ahead distance
 * over sideways drift so a grid moves column-by-column instead of diagonally.
 *
 * Only active while `data-input="remote"`. Mouse and touch users never pay for
 * it, and a keyboard user on a desktop keeps native Tab order — arrows there
 * still scroll the page unless the TV layout is on.
 *
 * Also maps the remote's Back button (and Escape) to history back, and Enter to
 * a click, which is what set-top browsers expect.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable]';

type Dir = "up" | "down" | "left" | "right";

const DIR_BY_KEY: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function visibleTargets(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    // Off-screen in the scroll direction is still reachable; fully collapsed is not.
    if (getComputedStyle(el).visibility === "hidden") continue;
    out.push(el);
  }
  return out;
}

/**
 * Directional cost: distance along the travel axis plus a heavy penalty for
 * lateral offset. The penalty is what keeps focus inside a column when moving
 * down a grid whose rows are wider than they are tall.
 */
function score(from: DOMRect, to: DOMRect, dir: Dir): number | null {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const dx = tx - fx;
  const dy = ty - fy;

  // Require real movement in the requested direction, using edges so that
  // overlapping neighbours (sticky headers) don't win.
  const forward =
    dir === "up"
      ? from.top - to.bottom
      : dir === "down"
        ? to.top - from.bottom
        : dir === "left"
          ? from.left - to.right
          : to.left - from.right;
  if (forward < -Math.min(from.height, to.height) / 2) return null;

  const along = Math.abs(dir === "up" || dir === "down" ? dy : dx);
  const across = Math.abs(dir === "up" || dir === "down" ? dx : dy);
  if (along < 1 && across < 1) return null;
  return along + across * 3;
}

export default function SpatialNav() {
  const { input, tv } = useDevice();
  const router = useRouter();

  useEffect(() => {
    if (input !== "remote" && !tv) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      const active = document.activeElement as HTMLElement | null;
      const typing =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);

      if (event.key === "Escape" || event.key === "GoBack" || event.key === "BrowserBack") {
        if (typing) {
          active?.blur();
          return;
        }
        event.preventDefault();
        router.back();
        return;
      }

      const dir = DIR_BY_KEY[event.key];
      if (!dir) return;
      // Let text fields own left/right for the caret.
      if (typing && (dir === "left" || dir === "right")) return;

      const targets = visibleTargets();
      if (targets.length === 0) return;

      // Nothing focused yet (fresh page load on a TV): grab the first target.
      if (!active || active === document.body || !targets.includes(active)) {
        event.preventDefault();
        targets[0].focus();
        targets[0].scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }

      const from = active.getBoundingClientRect();
      let best: HTMLElement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const el of targets) {
        if (el === active) continue;
        const value = score(from, el.getBoundingClientRect(), dir);
        if (value !== null && value < bestScore) {
          bestScore = value;
          best = el;
        }
      }

      // Dead end. Left/right at the end of a row wraps to the next line in
      // document order — otherwise the remote just stops responding, which
      // reads as a broken app from the couch. Up/down instead scrolls, so a
      // long page is still traversable when the next control is off-screen.
      if (!best) {
        const index = targets.indexOf(active);
        if (dir === "right" || dir === "left") {
          const next = targets[index + (dir === "right" ? 1 : -1)];
          if (!next) return;
          event.preventDefault();
          next.focus({ preventScroll: true });
          next.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
          return;
        }
        event.preventDefault();
        window.scrollBy({
          top: (dir === "down" ? 0.7 : -0.7) * window.innerHeight,
          behavior: "smooth",
        });
        return;
      }
      event.preventDefault();
      best.focus({ preventScroll: true });
      best.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [input, tv, router]);

  return null;
}
