"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpDown,
  Calendar,
  Flame,
  LayoutGrid,
  List,
  MoreVertical,
  Play,
  Star,
} from "lucide-react";
import { MOCK_MOVIES } from "@/data/mockAnime";
import type { Movie } from "@/data/mockAnime";
import {
  fetchAnimeDetail,
  fetchAniLibertyRelease,
  fetchEpisodes,
  fetchLatestReleases,
  fetchMovies,
  fetchSimilar,
} from "@/data/animeApi";
import type {
  AniReleaseFull,
  AnimeDetail,
  Episode,
  LatestRelease,
} from "@/data/animeApi";
import StreamNav from "@/components/stream/StreamNav";
import StreamFooter from "@/components/stream/StreamFooter";
import CommentsPanel from "@/components/anime/CommentsPanel";
import RemoteImage from "@/components/system/RemoteImage";
import RequireAuth from "@/components/auth/RequireAuth";
import styles from "./anime.module.css";

/** The tab strip jumps to real sections on this page — never a dead control. */
const SECTION_TABS: { label: string; hash: string; needsComments?: boolean }[] = [
  { label: "Серии", hash: "#episodes" },
  { label: "Похожие", hash: "#related" },
  { label: "Комментарии", hash: "#comments", needsComments: true },
  { label: "О производстве", hash: "#production" },
];

/** Map an AniLiberty release onto the catalog detail shape the page renders. */
function aniReleaseToDetail(r: AniReleaseFull): AnimeDetail {
  const poster = r.poster ?? "";
  return {
    malId: 0,
    title: r.title,
    titleEnglish: r.title,
    titleJapanese: r.subtitle,
    synopsis: r.description,
    background: "",
    type: r.typeLabel,
    source: null,
    status: r.isOngoing ? "Онгоинг" : "Завершён",
    episodes: r.episodesTotal,
    duration: r.avgDuration ? `${r.avgDuration} мин` : null,
    rating: r.ageLabel,
    score: null,
    rank: null,
    popularity: null,
    season: r.seasonLabel,
    year: r.year,
    airedString: null,
    broadcastDay: null,
    genres: r.genres,
    studios: [],
    heroImageUrl: poster,
    posterImageUrl: poster,
    logoImageUrl: null,
    trailerEmbedUrl: null,
  };
}

function aniReleaseToEpisodes(r: AniReleaseFull): Episode[] {
  return r.episodes.map((e) => ({
    number: e.ordinal,
    title: e.name || `Серия ${e.ordinal}`,
    duration: e.duration
      ? `${Math.floor(e.duration / 60)}:${String(e.duration % 60).padStart(2, "0")}`
      : "24:00",
    thumbnail: e.poster ?? r.poster,
  }));
}

function AnimeDetailContent() {
  const params = useParams<{ id: string }>();
  // A non-numeric id is an AniLiberty release alias (from the New Episodes feed).
  const isAniAlias = !/^\d+$/.test(params.id);
  const id = Number(params.id);
  // Watch-route base: numeric catalog id, or the alias for AniLiberty releases.
  const watchId = isAniAlias ? params.id : id;

  const [movies, setMovies] = useState<Movie[]>(MOCK_MOVIES);
  const [movie, setMovie] = useState<Movie>(MOCK_MOVIES[0]);
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<AnimeDetail | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [similar, setSimilar] = useState<Movie[]>([]);

  // Real "new episodes" feed from AniLiberty (plays in our own player).
  const [latest, setLatest] = useState<LatestRelease[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLatestReleases(6).then((rows) => {
      if (!cancelled) setLatest(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Episode toolbar state.
  const [epSearch, setEpSearch] = useState("");
  const [epAsc, setEpAsc] = useState(true);
  const [epView, setEpView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (isAniAlias) return;
    let cancelled = false;
    (async () => {
      const all = await fetchMovies();
      if (cancelled) return;
      setMovies(all);
      const found = all.find((m) => m.id === id) ?? all[0];
      setMovie(found);
      setReady(true);
      fetchSimilar(found.id, 4).then((rows) => {
        if (!cancelled) setSimilar(rows);
      });
      if (found.malId) {
        const [d, eps] = await Promise.all([
          fetchAnimeDetail(found.malId),
          fetchEpisodes(found.malId),
        ]);
        if (cancelled) return;
        if (d) setDetail(d);
        setEpisodes(eps);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isAniAlias]);

  // AniLiberty release detail (alias route): render from the live release feed.
  useEffect(() => {
    if (!isAniAlias) return;
    let cancelled = false;
    // Still surface the rest of the catalog for the "Recommended" rail.
    fetchMovies().then((all) => {
      if (!cancelled) setMovies(all);
    });
    fetchAniLibertyRelease(params.id).then((r) => {
      if (cancelled || !r) return;
      setDetail(aniReleaseToDetail(r));
      setEpisodes(aniReleaseToEpisodes(r));
      setMovie((m) => ({
        ...m,
        id: -1,
        title: r.title,
        description: r.description,
        year: r.year ? String(r.year) : m.year,
        rating: r.ageLabel ?? m.rating,
        genre: r.genres.join(" • ") || m.genre,
        imageUrl: r.poster ?? m.imageUrl,
        heroImageUrl: r.poster ?? m.heroImageUrl,
        logoImageUrl: undefined,
      }));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAniAlias, params.id]);

  // Our Russian localization wins; otherwise Jikan's English title, then romaji.
  const title = movie.localized ? movie.title : detail?.titleEnglish || detail?.title || movie.title;
  const logoImage = detail?.logoImageUrl ?? movie.logoImageUrl ?? null;
  const heroImage = detail?.heroImageUrl ?? movie.heroImageUrl;
  const posterImage = detail?.posterImageUrl ?? movie.imageUrl;
  const rating = detail?.rating ?? movie.rating;
  // Our categories are already Russian; Jikan's English genres only as a fallback.
  const ownGenres = movie.localized ? movie.tags.filter((t) => t !== "Топ аниме") : [];
  const genres = ownGenres.length
    ? ownGenres.join(" • ")
    : detail?.genres.length
      ? detail.genres.join(" • ")
      : movie.genre;

  const epCount = detail?.episodes ?? (episodes.length || 12);
  const totalMinutes = epCount * 24;
  const watchTime = `${Math.floor(totalMinutes / 60)} ч ${totalMinutes % 60} мин`;

  const allEpisodes: Episode[] = (
    episodes.length > 0
      ? episodes
      : Array.from({ length: Math.min(epCount, 12) }, (_, i) => ({
          number: i + 1,
          title: `Серия ${i + 1}`,
          duration: "24:00",
          thumbnail: null,
        }))
  ).slice(0, 24);

  const query = epSearch.trim().toLowerCase();
  const displayEpisodes: Episode[] = allEpisodes
    .filter(
      (ep) =>
        !query ||
        ep.title.toLowerCase().includes(query) ||
        String(ep.number).includes(query)
    )
    .sort((a, b) => (epAsc ? a.number - b.number : b.number - a.number));

  const others = movies.filter((m) => m.id !== movie.id);
  const newEpisodes = others.slice(0, 3);
  // Genre-matched titles; the catalogue head only while those are loading.
  const recommended = similar.length > 0 ? similar : others.slice(0, 4);

  const infoRows: { key: string; val: string }[] = [
    { key: "Тип:", val: detail?.type ?? "ТВ-сериал" },
    // Rows stay in place while the Jikan detail is loading ("…"), and drop out
    // only once it has loaded without them — otherwise the list grew under the
    // reader and pushed the description and the Watch button down.
    detail?.source || !detail ? { key: "Источник:", val: detail?.source ?? "…" } : null,
    {
      key: "Сезон:",
      val:
        detail?.season && detail?.year
          ? `${detail.season} ${detail.year}`
          : detail?.year
            ? String(detail.year)
            : movie.year,
    },
    { key: "Статус:", val: detail?.status ?? "Завершён" },
    { key: "Жанры:", val: genres },
    detail?.studios.length || !detail
      ? { key: "Студия:", val: detail ? detail.studios.join(", ") : "…" }
      : null,
    { key: "Длительность серии:", val: `~ ${detail?.duration ?? movie.duration}` },
    { key: "Всего серий:", val: `${epCount}` },
    { key: "Общее время просмотра:", val: watchTime },
  ].filter((r): r is { key: string; val: string } => r !== null);

  // Lazy load: skeleton until the real title resolves (no mock-title flash).
  if (!ready) {
    return (
      <div className={styles.page}>
        <StreamNav />
        <main id="main" className={styles.detailSkeleton} aria-busy="true">
          <span className={`${styles.skel} ${styles.skelPoster}`} />
          <div className={styles.skelCol}>
            <span className={styles.skel} style={{ width: "55%", height: 40 }} />
            <span className={styles.skel} style={{ width: "32%" }} />
            <span className={styles.skel} style={{ width: "90%" }} />
            <span className={styles.skel} style={{ width: "84%" }} />
            <span className={styles.skel} style={{ width: "70%" }} />
            <span className={styles.skel} style={{ width: 180, height: 46, marginTop: 12 }} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <StreamNav />

      <div className={styles.backdrop} aria-hidden="true">
        <RemoteImage
          src={heroImage}
          alt=""
          fill
          sizes="100vw"
          loading="eager"
          className={styles.backdropImg}
        />
        <div className={styles.backdropScrim} />
      </div>

      <div className={styles.shell}>
        {/* ───────── MAIN ───────── */}
        <main id="main">
          <div className={styles.headerRow}>
            <div className={styles.poster}>
              <RemoteImage
                src={posterImage}
                alt={title}
                fill
                sizes="300px"
                preload
                className={styles.posterImg}
              />
              <span className={styles.posterBadge}>
                <Flame size={20} fill="currentColor" />
              </span>
            </div>

            <div>
              {logoImage ? (
                <h1 className={styles.title} aria-label={title}>
                  {/* A plain <img> in a fixed-height box: the logo's width is only
                      known once it loads, so the box reserves the height up front
                      (no jump when it arrives) and next/image's fixed-ratio sizing
                      would distort a logo of unknown proportions. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoImage} alt={title} className={styles.titleLogo} decoding="async" />
                </h1>
              ) : (
                <h1 className={styles.title}>{title}</h1>
              )}
              <p className={styles.romaji}>
                {detail?.titleJapanese ?? title}
                {detail?.type ? ` · ${detail.type}` : ""}
              </p>

              <div className={styles.badgeRow}>
                <span className={styles.rating}>{rating}</span>
                {detail?.score ? (
                  <span className={styles.dayChip}>
                    <Star size={15} /> {detail.score.toFixed(2)}
                  </span>
                ) : null}
                {detail?.broadcastDay ? (
                  <span className={styles.dayChip}>
                    <Calendar size={15} /> {detail.broadcastDay}
                  </span>
                ) : null}
              </div>

              <dl className={styles.infoList} id="production">
                {infoRows.map((row) => (
                  <div key={row.key} className={styles.infoRow}>
                    <span className={styles.infoKey}>{row.key}</span>
                    <span className={styles.infoVal}>{row.val}</span>
                  </div>
                ))}
              </dl>

              <Link href={`/watch/${watchId}?ep=1`} className={styles.watchBtn} data-tap>
                <Play size={18} fill="currentColor" /> Смотреть с 1 серии
              </Link>
            </div>
          </div>

          <div className={styles.description}>
            <p>{movie.localized ? movie.description : detail?.synopsis || movie.description}</p>
            {detail?.background ? <p>{detail.background}</p> : null}
          </div>

          {/* Section jumps — these move focus to sections that really exist. */}
          <nav className={styles.tabs} aria-label="Разделы">
            {SECTION_TABS.filter((t) => !t.needsComments || !isAniAlias).map(
              (tab, i) => (
                <a
                  key={tab.label}
                  href={tab.hash}
                  className={`${styles.tab} ${i === 0 ? styles.tabActive : ""}`}
                >
                  {tab.label}
                </a>
              )
            )}
          </nav>

          {/* Toolbar */}
          <div className={styles.toolbar} id="episodes">
            <input
              className={styles.search}
              placeholder="Поиск по названию или номеру…"
              aria-label="Поиск серий"
              value={epSearch}
              onChange={(e) => setEpSearch(e.target.value)}
            />
            <button
              className={styles.toolBtn}
              type="button"
              aria-label="Сортировка"
              title={epAsc ? "По убыванию" : "По возрастанию"}
              onClick={() => setEpAsc((v) => !v)}
            >
              <ArrowUpDown size={18} />
            </button>
            <button
              className={`${styles.toolBtn} ${epView === "grid" ? styles.toolBtnActive : ""}`}
              type="button"
              aria-label="Плиткой"
              aria-pressed={epView === "grid"}
              onClick={() => setEpView("grid")}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              className={`${styles.toolBtn} ${epView === "list" ? styles.toolBtnActive : ""}`}
              type="button"
              aria-label="Списком"
              aria-pressed={epView === "list"}
              onClick={() => setEpView("list")}
            >
              <List size={18} />
            </button>
            <button className={styles.toolBtn} type="button" aria-label="Ещё">
              <MoreVertical size={18} />
            </button>
          </div>
          <p className={styles.watchedCount}>
            Просмотрено 0 из {allEpisodes.length}
          </p>

          {/* Episodes grid */}
          <div className={epView === "list" ? styles.epList : styles.epGrid}>
            {displayEpisodes.map((ep) => (
              <Link
                key={ep.number}
                href={`/watch/${watchId}?ep=${ep.number}`}
                className={styles.epCard}
              >
                <div className={styles.epThumb}>
                  <RemoteImage
                    src={ep.thumbnail || posterImage}
                    alt=""
                    fill
                    sizes="(max-width: 600px) 100vw, 480px"
                    className={styles.epThumbImg}
                  />
                  <span className={styles.epPlay}>
                    <Play size={20} fill="currentColor" />
                  </span>
                  <span className={styles.epDur}>{ep.duration}</span>
                </div>
                <div className={styles.epInfo}>
                  <p className={styles.epName}>{ep.title}</p>
                  <p className={styles.epNum}>Серия {ep.number}</p>
                </div>
              </Link>
            ))}
          </div>
        </main>

        {/* ───────── ASIDE ───────── */}
        <aside className={styles.aside}>
          <section className={styles.asideBlock}>
            <h2 className={styles.asideTitle}>Новые серии</h2>
            <p className={styles.asideSub}>Самые свежие серии в любимой озвучке</p>
            {latest.length > 0
              ? latest.map((r) => (
                  <Link key={r.id} href={r.href} className={styles.newEp}>
                    <div className={styles.newEpThumb}>
                      <RemoteImage src={r.poster} alt={r.title} fill sizes="96px" />
                    </div>
                    <div className={styles.newEpBody}>
                      <span className={styles.newEpTitle}>{r.title}</span>
                      <span className={styles.newEpMeta}>
                        {r.episodeNumber ? `Серия ${r.episodeNumber}` : "Новинка"}
                        {r.year ? ` · ${r.year}` : ""}
                        {r.ageLabel ? ` · ${r.ageLabel}` : ""}
                      </span>
                      <span className={styles.newEpBtn}>
                        <Play size={13} fill="currentColor" /> Смотреть
                      </span>
                    </div>
                  </Link>
                ))
              : newEpisodes.map((m, i) => (
                  <Link key={m.id} href={`/anime/${m.id}`} className={styles.newEp}>
                    <div className={styles.newEpThumb}>
                      <RemoteImage src={m.imageUrl} alt={m.title} fill sizes="96px" />
                    </div>
                    <div className={styles.newEpBody}>
                      <span className={styles.newEpTitle}>{m.title}</span>
                      <span className={styles.newEpMeta}>
                        Серия {10 - i} · {m.year} · {m.rating}
                      </span>
                      <span className={styles.newEpBtn}>
                        <Play size={13} fill="currentColor" /> Смотреть
                      </span>
                    </div>
                  </Link>
                ))}
          </section>

          <section className={styles.asideBlock} id="related">
            <h2 className={styles.asideTitle}>Рекомендуем</h2>
            <p className={styles.asideSub}>Релизы, которые могут вам понравиться</p>
            <div className={styles.recGrid}>
              {recommended.map((m) => (
                <Link key={m.id} href={`/anime/${m.id}`} className={styles.recCard}>
                  <RemoteImage src={m.imageUrl} alt={m.title} fill sizes="200px" />
                  <div className={styles.recScrim} />
                  <span className={styles.recTitle}>{m.title}</span>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {!isAniAlias && (
        <div className={styles.commentsBottom} id="comments">
          <CommentsPanel
            animeId={id}
            animeTitle={title}
            animeSynopsis={movie.localized ? movie.description : detail?.synopsis || movie.description}
          />
        </div>
      )}

      <div className={styles.footerWrap}>
        <StreamFooter />
      </div>
    </div>
  );
}

export default function AnimeDetailPage() {
  return (
    <RequireAuth>
      <AnimeDetailContent />
    </RequireAuth>
  );
}
