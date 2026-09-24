"use client";

import { useMemo } from "react";
import Link from "next/link";
import { History, Play } from "lucide-react";
import { getMyActivity, type WatchActivity } from "@/lib/auth-client";
import styles from "@/app/profile/profile.module.css";
import { clockTime, dayLabel, relativeTime } from "./format";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { useResource } from "./useResource";

export default function ActivityTab() {
  const activity = useResource<WatchActivity[]>(() => getMyActivity(30));

  const groups = useMemo(() => {
    const buckets = new Map<string, WatchActivity[]>();
    for (const ev of activity.data ?? []) {
      const key = dayLabel(ev.watchedAt);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(ev);
      else buckets.set(key, [ev]);
    }
    return [...buckets.entries()];
  }, [activity.data]);

  if (activity.loading) return <Skeleton lines={5} height={54} />;
  if (activity.error) {
    return (
      <ErrorState
        message={`Could not load your watch history. ${activity.error}`}
        onRetry={activity.reload}
      />
    );
  }
  if (groups.length === 0) {
    return (
      <EmptyState icon={<History size={22} />} title="Nothing watched yet">
        <p>
          Start an episode and your history builds up here — day by day, with
          the exact episode you stopped on.
        </p>
        <Link href="/stream" className={styles.primaryLink}>
          Start watching
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className={styles.activity}>
      {groups.map(([day, events]) => (
        <section key={day} className={styles.daySection} data-rise>
          <h2 className={styles.dayHead}>
            {day}
            <span className={styles.dayCount}>
              {events.length} episode{events.length === 1 ? "" : "s"}
            </span>
          </h2>
          <ul className={styles.timeline}>
            {events.map((ev) => (
              <li key={ev.id} className={styles.event}>
                <span className={styles.eventDot} aria-hidden />
                <Link
                  href={`/anime/${ev.animeKey}`}
                  className={styles.eventBody}
                >
                  <span className={styles.eventTitle}>{ev.animeTitle}</span>
                  <span className={styles.eventMeta}>
                    <span className={styles.chip}>
                      <Play size={11} /> Ep {ev.episode}
                    </span>
                    {ev.provider ? (
                      <span className={styles.chipMuted}>{ev.provider}</span>
                    ) : null}
                    <time dateTime={ev.watchedAt} className={styles.eventTime}>
                      {clockTime(ev.watchedAt)} · {relativeTime(ev.watchedAt)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
