"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import RemoteImage from "@/components/system/RemoteImage";
import { fetchContinueWatching, type WatchProgress } from "@/lib/library";
import type { Movie } from "@/data/mockAnime";
import streamStyles from "@/app/stream/stream.module.css";
import styles from "./ContinueRow.module.css";

/**
 * "Продолжить просмотр": unfinished episodes from the account's server-side
 * progress, newest first. Opening one lands on the saved second — the player
 * restores it from the same record.
 */
export default function ContinueRow({ movies }: { movies: Movie[] }) {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchProgress[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchContinueWatching(20).then((next) => {
      if (!cancelled) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || items.length === 0) return null;
  const byKey = new Map(movies.map((m) => [String(m.id), m]));

  return (
    <section className={streamStyles.row} aria-label="Продолжить просмотр">
      <h2 className={streamStyles.rowTitle}>Продолжить просмотр</h2>
      <div className={streamStyles.rowViewport}>
        {items.map((p) => {
          const movie = byKey.get(p.animeKey);
          const title = movie?.title ?? p.animeTitle ?? "Без названия";
          const fraction = p.durationSeconds ? Math.min(1, p.positionSeconds / p.durationSeconds) : 0;
          const left = p.durationSeconds ? Math.max(0, Math.round((p.durationSeconds - p.positionSeconds) / 60)) : null;
          return (
            <Link
              key={`${p.animeKey}-${p.episode}`}
              href={`/watch/${encodeURIComponent(p.animeKey)}?ep=${p.episode}`}
              className={styles.card}
              data-tap
            >
              <div className={styles.art}>
                <RemoteImage
                  src={movie?.heroImageUrl ?? movie?.imageUrl ?? "/hero-1.png"}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 70vw, 300px"
                  className={styles.img}
                />
                <span className={styles.play} aria-hidden="true">
                  <Play size={20} fill="currentColor" />
                </span>
                <span className={styles.bar} aria-hidden="true">
                  <span style={{ width: `${Math.round(fraction * 100)}%` }} />
                </span>
              </div>
              <span className={styles.title}>{title}</span>
              <span className={styles.meta}>
                Серия {p.episode}
                {left !== null ? ` · осталось ${left} мин` : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
