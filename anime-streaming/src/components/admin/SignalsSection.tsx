"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Star,
  UserX,
} from "lucide-react";
import { fetchSecurity, type SecurityOverview, type SecuritySignal } from "@/lib/adminSecurity";
import styles from "@/app/admin/admin.module.css";

/**
 * Abuse signals and server errors.
 *
 * Every entry is evidence, not a verdict: the platform states what it saw ("all
 * 12 ratings from this account are exactly 10") and leaves the decision to a
 * person. That is deliberate — automatic punishment based on heuristics is how
 * legitimate users get banned for enthusiasm.
 */

const ICONS: Record<string, typeof ShieldAlert> = {
  rating_burst: Star,
  uniform_ratings: Star,
  comment_flood: AlertTriangle,
  duplicate_comments: AlertTriangle,
  account_locked: UserX,
  failed_logins: ShieldAlert,
  many_sessions: ShieldAlert,
  geo_refusals: ShieldAlert,
};

export default function SignalsSection({
  onInspectUser,
}: {
  onInspectUser?: (userId: number) => void;
}) {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | SecuritySignal["severity"]>("all");

  // "Loading" is the absence of an answer, not a separate flag: a flag would
  // have to be raised synchronously from the mount effect.
  const loading = data === null && error === null;

  // A promise chain, not async/await: the state writes must happen in a
  // callback, never in the straight-line body an effect calls into.
  const load = useCallback(
    () =>
      fetchSecurity()
        .then((next) => {
          setData(next);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Could not load the feed.");
        }),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const signals = (data?.signals ?? []).filter((s) => filter === "all" || s.severity === filter);
  const counts = {
    high: data?.signals.filter((s) => s.severity === "high").length ?? 0,
    medium: data?.signals.filter((s) => s.severity === "medium").length ?? 0,
    low: data?.signals.filter((s) => s.severity === "low").length ?? 0,
  };

  return (
    <div className={styles.signalsWrap}>
      <header className={styles.sectionHead}>
        <div>
          <h2>
            <ShieldAlert size={20} /> Signals
          </h2>
          <p>
            Suspicious patterns and server errors, straight from the data. Nothing here is
            acted on automatically — it is a queue for you to judge.
          </p>
        </div>
        <div className={styles.geoStats}>
          <span data-tone="bad">
            <b>{counts.high}</b> high
          </span>
          <span data-tone="warn">
            <b>{counts.medium}</b> medium
          </span>
          <span>
            <b>{counts.low}</b> low
          </span>
          <button type="button" className={styles.btnGhost} onClick={load} disabled={loading}>
            {loading ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />}
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className={styles.notice}>{error}</div> : null}

      <div className={styles.periodChips} role="group" aria-label="Severity filter">
        {(["all", "high", "medium", "low"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-on={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "Everything" : value}
          </button>
        ))}
      </div>

      <section className={styles.card}>
        <h3>Abuse & security</h3>
        {signals.length === 0 ? (
          <p className={styles.geoHint}>
            {loading ? "Scanning…" : "Nothing suspicious in the current data."}
          </p>
        ) : (
          <ul className={styles.signalList}>
            {signals.map((signal, i) => {
              const Icon = ICONS[signal.kind] ?? AlertTriangle;
              return (
                <li key={`${signal.kind}-${i}`} data-severity={signal.severity}>
                  <span className={styles.signalIcon}>
                    <Icon size={16} />
                  </span>
                  <div className={styles.signalBody}>
                    <b>{signal.title}</b>
                    <span className={styles.signalSubject}>{signal.subject}</span>
                    <p>{signal.detail}</p>
                  </div>
                  {signal.userId && onInspectUser ? (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => onInspectUser(signal.userId!)}
                    >
                      Inspect
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h3>
          <Bug size={16} /> Recent server errors
        </h3>
        {data && data.errors.length > 0 ? (
          <ul className={styles.plainList}>
            {data.errors.map((entry, i) => (
              <li key={i}>
                <b>{entry.type}</b>
                <span>
                  {entry.method} {entry.path}
                  {entry.message ? ` — ${entry.message}` : ""}
                </span>
                <time>{new Date(entry.at).toLocaleTimeString()}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.geoHint}>
            No server errors recorded since the last restart. This buffer holds the most
            recent 100 and is intentionally memory-only, so a database outage cannot hide
            itself.
          </p>
        )}
      </section>
    </div>
  );
}
