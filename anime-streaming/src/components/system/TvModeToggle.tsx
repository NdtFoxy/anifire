"use client";

import { useDevice } from "./DeviceProvider";
import styles from "./TvModeToggle.module.css";

/**
 * Three-state control for the 10-foot layout: Auto follows user-agent
 * detection, On and Off pin it.
 *
 * Detection cannot see an HDMI cable, so a laptop plugged into a living-room
 * TV looks exactly like a laptop on a desk. This is the manual escape hatch,
 * and it persists (DeviceProvider writes it to localStorage) so the choice
 * survives a reload on the couch.
 */

const OPTIONS: { key: string; label: string; value: boolean | null }[] = [
  { key: "auto", label: "Auto", value: null },
  { key: "on", label: "On", value: true },
  { key: "off", label: "Off", value: false },
];

/**
 * The three states are pressed-toggle buttons in a labelled group rather than
 * a radiogroup: a radiogroup owes the user roving tabindex plus arrow-key
 * selection, and on a remote the arrows already belong to SpatialNav. Buttons
 * keep both contracts honest — every state is individually focusable and
 * activates on Enter or a tap.
 */

export default function TvModeToggle() {
  const { tv, tvOverride, setTvOverride } = useDevice();

  return (
    <div className={styles.wrap}>
      <span className={styles.title} id="tv-mode-label">
        TV mode
      </span>
      <div className={styles.group} role="group" aria-labelledby="tv-mode-label">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={tvOverride === opt.value}
            className={styles.opt}
            onClick={() => setTvOverride(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <span className={styles.hint}>
        {tvOverride === null
          ? tv
            ? "Detected a TV — couch layout is on."
            : "Following device detection."
          : tvOverride
            ? "Forced on: bigger targets, remote navigation."
            : "Forced off, even on a TV."}
      </span>
    </div>
  );
}
