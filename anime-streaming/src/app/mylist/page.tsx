"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Play, Star, Trash2 } from "lucide-react";
import StreamNav from "@/components/stream/StreamNav";
import StreamFooter from "@/components/stream/StreamFooter";
import RequireAuth from "@/components/auth/RequireAuth";
import { useMyList } from "@/lib/mylist";
import { fetchMovies } from "@/data/animeApi";
import type { Movie } from "@/data/mockAnime";
import { useReveal } from "@/lib/useReveal";
import Lottie from "@/components/system/Lottie";
import RemoteImage from "@/components/system/RemoteImage";
import styles from "./mylist.module.css";

function MyListContent() {
  const { list, toggleList } = useMyList();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMovies().then((all) => {
      if (cancelled) return;
      setMovies(all);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => movies.filter((m) => list.includes(m.id)),
    [movies, list]
  );

  useReveal(pageRef, [items.length, loading]);

  return (
    <div className={styles.page} ref={pageRef}>
      <StreamNav />

      <header className={styles.header}>
        <div className={styles.headIcon}>
          <Bookmark size={26} fill="currentColor" />
        </div>
        <div>
          <p className={styles.eyebrow}>Your collection</p>
          <h1 className={styles.title}>My List</h1>
          <p className={styles.sub}>
            {list.length > 0
              ? `${list.length} ${list.length === 1 ? "title" : "titles"} saved for later.`
              : "Save titles to watch them later."}
          </p>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {loading ? (
          <div className={styles.grid}>
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className={styles.skel} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className={`${styles.empty} popIn`}>
            {/* The only illustration on the page: worth a moving one, and worth
                degrading to the icon if the file is ever missing. */}
            <Lottie
              src="/lottie/ember-pulse.json"
              className={styles.emptyArt}
              fallback={<Bookmark size={40} />}
            />
            <h2>Nothing here yet</h2>
            <p>Tap the + on any title to add it to your list.</p>
            <Link href="/stream" className={styles.browseBtn} data-tap>
              <Play size={16} fill="currentColor" /> Browse catalog
            </Link>
          </div>
        ) : (
          <div className={styles.grid} data-reveal>
            {items.map((m) => (
              <div key={m.id} className={styles.card} data-reveal-child>
                <Link href={`/anime/${m.id}`} className={styles.poster}>
                  <RemoteImage
                    src={m.imageUrl}
                    alt={m.title}
                    fill
                    sizes="(max-width: 600px) 50vw, (max-width: 1280px) 25vw, 400px"
                  />
                  <span className={styles.playOverlay}>
                    <Play size={22} fill="currentColor" />
                  </span>
                  {m.match ? (
                    <span className={styles.score}>
                      <Star size={12} fill="currentColor" /> {(m.match / 10).toFixed(1)}
                    </span>
                  ) : null}
                </Link>
                <div className={styles.meta}>
                  <Link href={`/anime/${m.id}`} className={styles.name}>
                    {m.title}
                  </Link>
                  <span className={styles.genre}>{m.genre}</span>
                </div>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label="Remove from My List"
                  onClick={() => toggleList(m.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <StreamFooter />
    </div>
  );
}

export default function MyListPage() {
  return (
    <RequireAuth>
      <MyListContent />
    </RequireAuth>
  );
}
