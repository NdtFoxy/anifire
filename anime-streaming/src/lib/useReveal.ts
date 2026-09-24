"use client";

import { useEffect } from "react";

/**
 * Reveals `[data-reveal]` sections inside `root` as they scroll into view, once
 * each.
 *
 * The hook only writes `data-shown`; the animation lives in motion.css. That
 * split matters — a section already on screen at load, a browser without
 * IntersectionObserver, and a user who asked for reduced motion all reach the
 * same visible end state without a second code path.
 *
 * Two mechanisms, because one is not enough:
 *
 * - **The observer** handles the normal case and costs nothing while scrolling.
 * - **A throttled sweep** handles sections the observer never hears about. An
 *   observer only fires when an intersection state *changes*, so a jump — End,
 *   an anchor link, a restored scroll position — can carry a section from below
 *   the fold to above it without a single callback, and it would stay invisible
 *   for the rest of the session. Measured, not theorised: an instant jump to the
 *   bottom of the landing page left 8 of 10 sections blank.
 *
 * Both feed the same `show()`, and both detach as soon as nothing is pending, so
 * a fully revealed page carries no listeners at all.
 *
 * `[data-reveal-child]` elements inside a section get `--reveal-index`, so the
 * stagger is data rather than a hand-written nth-child chain.
 *
 * @param root element whose `[data-reveal]` descendants should reveal
 * @param deps re-scan when the set of sections changes (after data arrives)
 */
export function useReveal(root: React.RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const sections = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!sections.length) return;

    for (const section of sections) {
      section
        .querySelectorAll<HTMLElement>("[data-reveal-child]")
        .forEach((child, i) => child.style.setProperty("--reveal-index", String(i)));
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      // Not a fallback so much as the same destination without the journey.
      for (const section of sections) section.dataset.shown = "true";
      return;
    }

    const pending = new Set(sections);
    let observer: IntersectionObserver | null = null;
    let frame = 0;

    const detach = () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const show = (section: HTMLElement) => {
      section.dataset.shown = "true";
      pending.delete(section);
      observer?.unobserve(section);
      if (!pending.size) detach();
    };

    function sweep() {
      frame = 0;
      const height = window.innerHeight;
      for (const section of Array.from(pending)) {
        const rect = section.getBoundingClientRect();
        // Above the fold means it was passed; overlapping the viewport means it
        // is being read right now. Both are "seen".
        if (rect.bottom < 0 || (rect.top < height && rect.bottom > 0)) show(section);
      }
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(sweep);
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) show(entry.target as HTMLElement);
        }
      },
      // Fire a little before the section is fully in frame, and never wait for the
      // bottom of a tall one: the reveal should finish as the reader's eye arrives,
      // not start under it.
      { rootMargin: "-6% 0px -10% 0px", threshold: 0.01 }
    );
    for (const section of pending) observer.observe(section);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
