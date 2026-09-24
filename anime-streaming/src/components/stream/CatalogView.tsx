"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { gsap } from "gsap";
import {
  Check,
  ChevronDown,
  ListPlus,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import type { Movie } from "@/data/mockAnime";
import { useDevice } from "@/components/system/DeviceProvider";
import { useMyList } from "@/lib/mylist";
import styles from "@/app/stream/stream.module.css";

const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance",
  "Sci-Fi", "Slice of Life", "Supernatural", "Mystery", "Horror", "Sports",
];
const TYPES = ["TV", "ONA", "WEB", "OVA", "Movie", "Special"];
const STATUSES = ["Ongoing", "Finished"];

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function CatalogView({
  movies,
  onOpen,
  initialQuery = "",
}: {
  movies: Movie[];
  onOpen: (m: Movie) => void;
  initialQuery?: string;
}) {
  // The navbar search drives `initialQuery`; local typing only overrides it
  // until the URL moves again, so no effect has to copy the prop into state.
  const [typed, setTyped] = useState<{ from: string; value: string } | null>(null);
  const query = typed && typed.from === initialQuery ? typed.value : initialQuery;
  const setQuery = (value: string) => setTyped({ from: initialQuery, value });
  const [genres, setGenres] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const { device } = useDevice();
  const { inList, isLiked, toggleList, toggleLike } = useMyList();

  // On a phone three chip walls would push the catalog off the screen, so the
  // filters start folded; anywhere with room they are open by default. The
  // toggle overrides that default until the device class itself changes.
  const [folded, setFolded] = useState<{ device: string; open: boolean } | null>(
    null
  );
  const filtersOpen =
    folded && folded.device === device ? folded.open : device !== "phone";
  const setFiltersOpen = (next: boolean) => setFolded({ device, open: next });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movies.filter((m) => {
      if (q && !m.title.toLowerCase().includes(q)) return false;
      // Strict on type (all backend titles default to TV); soft on genre/status
      // until the backend stores that metadata — selected chips never empty the
      // list when the field is absent.
      if (types.size && !types.has("TV")) return false;
      return true;
    });
  }, [movies, query, types]);

  // GSAP: stagger the cards in whenever the filtered set changes.
  useEffect(() => {
    if (!listRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    gsap.fromTo(
      listRef.current.children,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.05, duration: 0.45, ease: "power2.out" }
    );
  }, [filtered]);

  const activeFilters = genres.size + types.size + statuses.size;
  const hasFilters = Boolean(query) || activeFilters > 0;
  const clearAll = () => {
    setQuery("");
    setGenres(new Set());
    setTypes(new Set());
    setStatuses(new Set());
  };

  return (
    <div className={styles.catalog}>
      <div className={styles.catSearch}>
        <span className={styles.catSearchIcon}>
          <Search size={18} />
        </span>
        <input
          className={styles.catSearchInput}
          placeholder="Search the catalog…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search catalog"
        />
        <button
          className={styles.catClearBtn}
          type="button"
          onClick={clearAll}
          disabled={!hasFilters}
          aria-label="Clear filters"
        >
          <X size={18} />
        </button>
      </div>

      <div className={styles.catGrid}>
        {/* ───────── filters ───────── */}
        <aside className={styles.filterPanel}>
          <button
            type="button"
            className={styles.filterToggle}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <span className={styles.filterToggleLeft}>
              <SlidersHorizontal size={17} />
              Filters
              {activeFilters > 0 ? (
                <span className={styles.filterCount}>{activeFilters}</span>
              ) : null}
            </span>
            <ChevronDown
              size={18}
              style={{ transform: filtersOpen ? "rotate(180deg)" : undefined }}
            />
          </button>

          {filtersOpen ? (
            <div className={styles.filterBody}>
              <div className={styles.filterSection}>
                <h4 className={styles.filterTitle}>Genres</h4>
                <p className={styles.filterHint}>
                  Pick genres — multiple selections are combined.
                </p>
                <div className={styles.filterChips}>
                  {GENRES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={genres.has(g)}
                      className={`${styles.chip} ${genres.has(g) ? styles.chipOn : ""}`}
                      onClick={() => setGenres((s) => toggle(s, g))}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterSection}>
                <h4 className={styles.filterTitle}>Type</h4>
                <p className={styles.filterHint}>Filter releases by format.</p>
                <div className={styles.filterChips}>
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={types.has(t)}
                      className={`${styles.chip} ${types.has(t) ? styles.chipOn : ""}`}
                      onClick={() => setTypes((s) => toggle(s, t))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterSection}>
                <h4 className={styles.filterTitle}>Release status</h4>
                <p className={styles.filterHint}>Airing or finished.</p>
                <div className={styles.filterChips}>
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={statuses.has(s)}
                      className={`${styles.chip} ${statuses.has(s) ? styles.chipOn : ""}`}
                      onClick={() => setStatuses((set) => toggle(set, s))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className={styles.filterReset}
                type="button"
                onClick={clearAll}
                disabled={!hasFilters}
              >
                Reset filters
              </button>
            </div>
          ) : null}
        </aside>

        {/* ───────── poster grid ───────── */}
        <div ref={listRef} className={styles.catList}>
          {filtered.length === 0 ? (
            <p className={styles.catEmpty}>Nothing matches your filters.</p>
          ) : (
            filtered.map((m) => (
              <article
                key={m.id}
                className={styles.catCard}
                onClick={() => onOpen(m)}
                role="button"
                tabIndex={0}
                data-focusable
                aria-label={m.title}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(m);
                  }
                }}
              >
                <div className={styles.catPoster}>
                  <img src={m.imageUrl} alt="" loading="lazy" />
                  <div className={styles.catActions}>
                    <button
                      className={`${styles.catIconBtn} ${
                        isLiked(m.id) ? styles.catIconBtnOn : ""
                      }`}
                      type="button"
                      aria-label={isLiked(m.id) ? `Unlike ${m.title}` : `Like ${m.title}`}
                      aria-pressed={isLiked(m.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(m.id);
                      }}
                    >
                      <Star size={16} fill={isLiked(m.id) ? "currentColor" : "none"} />
                    </button>
                    <button
                      className={`${styles.catIconBtn} ${
                        inList(m.id) ? styles.catIconBtnOn : ""
                      }`}
                      type="button"
                      aria-label={
                        inList(m.id)
                          ? `Remove ${m.title} from My List`
                          : `Add ${m.title} to My List`
                      }
                      aria-pressed={inList(m.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleList(m.id);
                      }}
                    >
                      {inList(m.id) ? <Check size={16} /> : <ListPlus size={16} />}
                    </button>
                  </div>
                </div>
                <h3 className={styles.catTitle}>{m.title}</h3>
                <div className={styles.catMeta}>
                  <span>{m.year}</span>
                  <span className={styles.catMatch}>{m.match}% Match</span>
                  <span>{m.rating}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
