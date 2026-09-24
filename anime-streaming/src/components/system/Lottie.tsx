"use client";

import { useEffect, useRef, useState } from "react";
// Type-only: erased at build time, so the engine still arrives lazily below.
import type { AnimationItem } from "lottie-web";

/**
 * Lottie player.
 *
 * Drop a `.json` export from LottieFiles into `public/lottie/` and point `src`
 * at it: `<Lottie src="/lottie/empty-list.json" />`. Nothing else is required.
 *
 * Four decisions worth knowing about, because each one is a bug someone else has
 * already shipped:
 *
 * 1. **The engine is loaded on demand.** `lottie-web` is ~250 KB of JavaScript —
 *    more than this app's entire first load. It is imported inside an effect, so
 *    a page with no animation never pays for it, and the import is shared once it
 *    has happened.
 * 2. **It stops when it is off screen.** A looping animation repaints forever
 *    otherwise, which on a phone is a battery drain the user cannot see the cause
 *    of. An IntersectionObserver plays and pauses it.
 * 3. **Reduced motion means a still frame, not a blank box.** The artwork is
 *    often the only illustration on an empty state; the animation is rendered and
 *    parked on a representative frame instead of being dropped.
 * 4. **A missing or broken file is not a crash.** `fallback` (or nothing) renders
 *    instead — an empty state must never be the thing that breaks the page.
 */
export default function Lottie({
  src,
  loop = true,
  autoplay = true,
  speed = 1,
  /** Frame shown when the user asked for reduced motion. */
  stillFrame = 0,
  className,
  /** Rendered if the animation cannot be loaded at all. */
  fallback = null,
  ariaLabel,
}: {
  src: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  stillFrame?: number;
  className?: string;
  fallback?: React.ReactNode;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let animation: AnimationItem | null = null;
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    (async () => {
      try {
        // Both the engine and the animation data are fetched here, so a failure
        // in either lands in the same catch and the same fallback.
        const [{ default: lottie }, data] = await Promise.all([
          import("lottie-web"),
          fetch(src).then((r) => {
            if (!r.ok) throw new Error(`${r.status} ${src}`);
            return r.json();
          }),
        ]);
        if (cancelled) return;

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        animation = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: reduce ? false : loop,
          autoplay: false,
          animationData: data,
        });
        if (!animation) return;
        animation.setSpeed(speed);

        if (reduce) {
          animation.goToAndStop(stillFrame, true);
          return;
        }

        if (typeof IntersectionObserver === "undefined") {
          if (autoplay) animation.play();
          return;
        }

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!animation) return;
              if (entry.isIntersecting) {
                if (autoplay) animation.play();
              } else {
                animation.pause();
              }
            }
          },
          { threshold: 0.15 }
        );
        observer.observe(container);
      } catch (error) {
        if (cancelled) return;
        // One line, once: a decorative asset failing is worth knowing about in
        // development and worth nothing at all to the user.
        console.warn("Lottie failed:", error);
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      animation?.destroy();
    };
  }, [src, loop, autoplay, speed, stillFrame]);

  if (failed) return <>{fallback}</>;

  return (
    <div
      ref={host}
      className={className}
      // The animation is illustration: it gets a label only when it carries
      // meaning the surrounding copy does not.
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  );
}
