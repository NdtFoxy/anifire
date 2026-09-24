"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bookmark, Play, Star, Trash2 } from "lucide-react";
import { fetchMovies } from "@/data/animeApi";
import type { Movie } from "@/data/mockAnime";
import { useMyList } from "@/lib/mylist";
import styles from "@/app/profile/profile.module.css";
import { CardSkeleton, EmptyState, ErrorState } from "./states";
import { useResource } from "./useResource";

export default function BookmarksTab() {
  const { list, toggleList } = useMyList();
  const catalog = useResource<Movie[]>(() => fetchMovies());

  // `list` lives in localStorage, so removing an item re-renders instantly.
  const items = useMemo(
    () => (catalog.data ?? []).filter((m) => list.includes(m.id)),
    [catalog.data, list]
  );

  if (catalog.loading) return <CardSkeleton count={8} />;
  if (catalog.error) {
    return (
      <ErrorState
        message={`Could not load the catalog. ${catalog.error}`}
        onRetry={catalog.reload}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={<Bookmark size={22} />} title="No bookmarks yet">
        <p>
          Hit the bookmark button on any title and it will wait for you right
          here.
        </p>
        <Link href="/stream" className={styles.primaryLink}>
          Find something to watch
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <div className={styles.sectionHead} data-rise>
        <h2 className={styles.sectionTitle}>Bookmarks</h2>
        <span className={styles.sectionMeta}>{items.length} saved</span>
      </div>
      <ul className={styles.posterGrid} data-rise>
        {items.map((m) => (
          <li key={m.id} className={styles.poster}>
            <Link href={`/anime/${m.id}`} className={styles.posterLink}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.imageUrl} alt="" className={styles.posterImg} />
              <span className={styles.posterOverlay}>
                <Play size={18} />
              </span>
            </Link>
            <button
              type="button"
              className={styles.posterRemove}
              onClick={() => toggleList(m.id)}
              aria-label={`Remove ${m.title} from bookmarks`}
            >
              <Trash2 size={14} />
            </button>
            <div className={styles.posterMeta}>
              <Link href={`/anime/${m.id}`} className={styles.posterTitle}>
                {m.title}
              </Link>
              <span className={styles.posterSub}>
                <Star size={12} /> {m.match}% · {m.genre}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
