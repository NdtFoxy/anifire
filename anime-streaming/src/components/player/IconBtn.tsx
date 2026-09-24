"use client";

import styles from "./player.module.css";

/** Square control-bar button; `badge` adds the dot used for "upscale on". */
export default function IconBtn({
  children,
  label,
  onClick,
  active,
  badge,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.iconBtn} ${active ? styles.iconActive : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {badge ? <span className={styles.iconBadge} /> : null}
    </button>
  );
}
