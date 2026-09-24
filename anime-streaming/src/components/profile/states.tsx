"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import styles from "@/app/profile/profile.module.css";

export function Skeleton({
  lines = 3,
  height = 18,
}: {
  lines?: number;
  height?: number;
}) {
  return (
    <div className={styles.skeletonStack} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className={styles.skeleton}
          style={{ height, width: `${100 - i * 9}%` }}
        />
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.posterGrid} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`${styles.skeleton} ${styles.posterSkeleton}`} />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className={styles.errorState} role="alert">
      <AlertTriangle size={20} className={styles.errorIcon} />
      <p className={styles.errorText}>{message}</p>
      <button
        type="button"
        className={styles.retryBtn}
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? (
          <Loader2 size={15} className={styles.spin} />
        ) : (
          <RotateCcw size={15} />
        )}
        Try again
      </button>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>{icon}</span>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {children ? <div className={styles.emptyBody}>{children}</div> : null}
    </div>
  );
}
