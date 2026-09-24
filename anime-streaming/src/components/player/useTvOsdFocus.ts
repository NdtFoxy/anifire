"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isChrome } from "./osd";

/**
 * On TV the OSD is also the focus surface: remember which control the user was
 * on when the bar auto-hides, restore it when the bar comes back, and drop
 * focus while it is hidden so SpatialNav never targets an invisible button.
 * `isChrome` matches the [data-osd] regions, which are the only focusables the
 * player owns.
 */
export function useTvOsdFocus({
  enabled,
  controls,
  playBtnRef,
}: {
  /**
   * TV, full mode, and no pre-roll: the roll's Skip button is the focus surface
   * while an ad plays; the OSD behind it is hidden and cannot be focused at all.
   */
  enabled: boolean;
  controls: boolean;
  /** Fallback target when the remembered control is gone. */
  playBtnRef: RefObject<HTMLButtonElement | null>;
}) {
  /** The OSD control that had focus when the bar last auto-hid. */
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!controls) {
      const active = document.activeElement as HTMLElement | null;
      if (active && isChrome(active)) {
        lastFocusRef.current = active;
        active.blur();
      }
      return;
    }
    const id = window.requestAnimationFrame(() => {
      const remembered = lastFocusRef.current;
      const target =
        remembered && remembered.isConnected && isChrome(remembered)
          ? remembered
          : playBtnRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [enabled, controls, playBtnRef]);

  /* While the OSD is open it is the ONLY focus surface. SpatialNav walks the
     whole document, so if the D-pad wanders onto something behind the overlay we
     pull focus back to the last OSD control instead of letting it vanish. */
  useEffect(() => {
    if (!enabled || !controls) return;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el === document.body) return;
      if (isChrome(el)) {
        lastFocusRef.current = el;
        return;
      }
      const back = lastFocusRef.current?.isConnected
        ? lastFocusRef.current
        : playBtnRef.current;
      back?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [enabled, controls, playBtnRef]);
}
