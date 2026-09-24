"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MiniLayout } from "./PlayerProvider";

const ASPECT = 9 / 16;
const MINI_MIN = 260;
const MINI_MAX = 760;

/**
 * Geometry of the floating mini player: the stored layout clamped to the current
 * screen, plus the live drag/resize that only commits on release.
 */
export function useMiniWindow({
  mini,
  setMini,
}: {
  mini: MiniLayout;
  setMini: (patch: Partial<MiniLayout>) => void;
}) {
  /** Viewport size as state rather than a render-time `window` read: the mini
      window must stay on screen after a rotate, and reading window during render
      desyncs the server pass from hydration. */
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const sync = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  const [drag, setDrag] = useState<Pick<MiniLayout, "x" | "y" | "width"> | null>(
    null
  );

  const layout = useMemo<MiniLayout>(() => {
    const vw = viewport.w || 1280;
    const vh = viewport.h || 720;
    // The window must fit the screen it is on: a desktop-sized mini player has
    // to survive a rotate into a 390px-wide phone, and it must never hide under
    // the phone tab bar.
    const nav = navReserve();
    const maxWidth = Math.min(MINI_MAX, vw - 16, (vh - 16 - nav) / ASPECT);
    const width = Math.max(160, Math.min(drag?.width ?? mini.width, maxWidth));
    const height = width * ASPECT;
    let x = drag?.x ?? mini.x;
    let y = drag?.y ?? mini.y;
    if (x < 0) x = vw - width - 24;
    if (y < 0) y = vh - height - nav - 24;
    x = Math.max(8, Math.min(x, vw - width - 8));
    y = Math.max(8, Math.min(y, vh - height - nav - 8));
    return { x, y, width, opacity: mini.opacity };
  }, [drag, mini, viewport]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const base = { x: layout.x, y: layout.y, width: layout.width };
      // The latest position lives in a local, not in the state updater: calling
      // setMini (PlayerProvider's state) from inside a setDrag updater is a
      // setState during render and React warned on every drag.
      let last: typeof base | null = null;
      const move = (ev: PointerEvent) => {
        last = {
          width: base.width,
          x: base.x + (ev.clientX - startX),
          y: base.y + (ev.clientY - startY),
        };
        setDrag(last);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (last) setMini({ x: clampX(last.x, last.width), y: clampY(last.y, last.width) });
        setDrag(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [layout, setMini]
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const baseW = layout.width;
      const baseX = layout.x;
      const baseY = layout.y;
      let lastWidth: number | null = null;
      const move = (ev: PointerEvent) => {
        lastWidth = Math.max(MINI_MIN, Math.min(MINI_MAX, baseW + (ev.clientX - startX)));
        setDrag({ x: baseX, y: baseY, width: lastWidth });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (lastWidth !== null) setMini({ width: lastWidth });
        setDrag(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [layout, setMini]
  );

  return {
    /** Viewport height doubles as the full-mode subtitle sizing basis. */
    viewport,
    layout,
    height: layout.width * ASPECT,
    startDrag,
    startResize,
  };
}

/**
 * Height the phone tab bar reserves, read from the shared `--mobile-nav-h`
 * token so the mini window and the CSS can never disagree about it.
 */
function navReserve() {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--mobile-nav-h"
  );
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}

function clampX(x: number, width: number) {
  if (typeof window === "undefined") return x;
  return Math.max(8, Math.min(x, window.innerWidth - width - 8));
}
function clampY(y: number, width: number) {
  if (typeof window === "undefined") return y;
  return Math.max(
    8,
    Math.min(y, window.innerHeight - width * ASPECT - navReserve() - 8)
  );
}
