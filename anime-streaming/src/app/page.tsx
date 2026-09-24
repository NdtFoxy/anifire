"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  Play,
  Plus,
  Sparkles,
  Star,
  Volume2,
} from "lucide-react";
import { useReveal } from "@/lib/useReveal";
import { fetchRows, fetchMovies } from "@/data/animeApi";
import type { Movie, Row } from "@/data/mockAnime";
import { useAuth } from "@/components/auth/AuthProvider";
import RemoteImage from "@/components/system/RemoteImage";
import styles from "./home.module.css";

/**
 * Public home page. Everything here is browsable without an account: the hero,
 * the Top 10 and every row come from the public catalog endpoints, so a first
 * time visitor sees the real library instead of a marketing promise. Sign-in is
 * only demanded at the moment it is actually needed — pressing Play.
 */

const HERO_ROTATE_MS = 9000;
const FAQ = [
  {
    q: "What is Anifire?",
    a: "A streaming service for anime: series and films in HD with multi-language subtitles and dubs, a personal list, and resume-where-you-left-off across every device.",
  },
  {
    q: "How much does it cost?",
    a: "Browsing the catalogue is free. Watching needs a free account; an optional ad-free plan removes the pre-roll sponsor spots for good.",
  },
  {
    q: "Where can I watch?",
    a: "Anywhere with a browser — phone, tablet, laptop, ultrawide desktop and TV. The TV layout is driven entirely by the remote's D-pad.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. The free tier never charges, and a paid plan stays active until the end of the period you already paid for.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [featured, setFeatured] = useState<Movie[]>([]);
  const [top10, setTop10] = useState<Movie[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMovies(), fetchRows()])
      .then(([movies, catalogueRows]) => {
        if (cancelled) return;
        const ranked = [...movies].sort((a, b) => b.match - a.match);
        setFeatured(ranked.filter((m) => m.heroImageUrl).slice(0, 5));
        setTop10(ranked.slice(0, 10));
        setRows(catalogueRows.slice(0, 6));
      })
      .catch(() => {
        /* fetchMovies/fetchRows already fall back to a bundled catalogue */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hero rotation. Paused when the tab is hidden so a background tab does not
  // burn through the list, and disabled outright for reduced-motion users.
  useEffect(() => {
    if (featured.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setHeroIndex((i) => (i + 1) % featured.length);
    }, HERO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [featured.length]);

  // Reveals are shared with the rest of the app now — see lib/useReveal.
  useReveal(pageRef, [rows.length, top10.length]);

  // Hero copy animates in on every rotation, independent of the reveals above.
  useEffect(() => {
    if (!featured.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-hero-copy] > *",
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, stagger: 0.07, ease: "power3.out" }
      );
    }, pageRef);
    return () => ctx.revert();
  }, [heroIndex, featured.length]);

  const hero = featured[heroIndex];

  /** Play is the one action that needs an account — send guests to sign-in with
   *  a next= hop so they land on the episode they picked, not on a dashboard. */
  const play = useCallback(
    (movie: Movie) => {
      const target = `/watch/${movie.id}`;
      router.push(user ? target : `/login?next=${encodeURIComponent(target)}`);
    },
    [router, user]
  );

  return (
    <main id="main" className={styles.page} ref={pageRef}>
      {/* ═══════════ NAV ═══════════ */}
      <header className={`${styles.nav} ${scrolled ? styles.navSolid : ""}`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>
            <Flame size={18} fill="currentColor" />
          </span>
          Anifire
        </Link>
        <nav className={styles.navLinks}>
          <a href="#trending">Trending</a>
          <a href="#browse">Browse</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className={styles.navActions}>
          {user ? (
            <Link href="/stream" className={styles.navPrimary} data-tap>
              Go to catalogue
            </Link>
          ) : (
            <>
              <Link href="/login" className={styles.navGhost} data-tap>
                Sign in
              </Link>
              <Link href="/register" className={styles.navPrimary} data-tap>
                Join free
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <section className={styles.hero} aria-label="Featured title">
        <div className={styles.heroStage}>
          {featured.map((movie, i) => (
            <div
              key={movie.id}
              className={styles.heroSlide}
              data-active={i === heroIndex}
              aria-hidden={i !== heroIndex}
            >
              <RemoteImage
                src={movie.heroImageUrl}
                alt=""
                fill
                sizes="100vw"
                loading="eager"
                preload={i === 0}
                className={styles.heroImg}
              />
            </div>
          ))}
          <div className={styles.heroScrim} />
          <div className={styles.heroVignette} />
        </div>

        <div className={styles.heroInner}>
          <div className={styles.heroCopy} data-hero-copy>
            <span className={styles.heroEyebrow}>
              <Sparkles size={14} /> No account needed to look around
            </span>
            {hero ? (
              <>
                <h1 className={styles.heroTitle}>{hero.title}</h1>
                <div className={styles.heroMeta}>
                  <span className={styles.heroMatch}>{hero.match}% match</span>
                  <span>{hero.year}</span>
                  <span className={styles.heroPill}>{hero.rating}</span>
                  <span>{hero.duration}</span>
                  <span className={styles.heroPill}>HD</span>
                </div>
                <p className={styles.heroDesc}>{hero.description}</p>
                <div className={styles.heroBtns}>
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={() => play(hero)}
                  >
                    <Play size={19} fill="currentColor" /> Play
                  </button>
                  <Link href="/register" className={styles.infoBtn} data-tap>
                    <Info size={19} /> Start free
                  </Link>
                </div>
              </>
            ) : (
              <div className={styles.heroSkeleton} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          {featured.length > 1 ? (
            <div className={styles.heroDots} role="tablist" aria-label="Featured titles">
              {featured.map((movie, i) => (
                <button
                  key={movie.id}
                  type="button"
                  role="tab"
                  aria-selected={i === heroIndex}
                  aria-label={movie.title}
                  className={styles.heroDot}
                  data-on={i === heroIndex}
                  onClick={() => setHeroIndex(i)}
                >
                  <span style={{ animationDuration: `${HERO_ROTATE_MS}ms` }} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* ═══════════ TOP 10 ═══════════ */}
      <section id="trending" className={styles.section} data-reveal>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Top 10 this week</h2>
          <span className={styles.sectionNote}>Ranked by viewer match</span>
        </div>
        <Rail>
          {top10.map((movie, i) => (
            <article key={movie.id} className={styles.rankCard} data-focusable tabIndex={0}>
              <span className={styles.rankNum} aria-hidden="true">
                {i + 1}
              </span>
              <button type="button" className={styles.rankArt} onClick={() => play(movie)}>
                <RemoteImage src={movie.imageUrl} alt={movie.title} fill sizes="138px" />
                <span className={styles.rankPlay}>
                  <Play size={18} fill="currentColor" />
                </span>
              </button>
              <div className={styles.rankBody}>
                <h3>{movie.title}</h3>
                <p>
                  <Star size={12} fill="currentColor" /> {movie.match}% ·{" "}
                  {movie.tags[0] ?? movie.genre.split("•")[0]?.trim()}
                </p>
              </div>
            </article>
          ))}
        </Rail>
      </section>

      {/* ═══════════ CATALOGUE ROWS ═══════════ */}
      <div id="browse">
        {rows.map((row) => (
          <section key={row.title} className={styles.section} data-reveal>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{row.title}</h2>
              <Link href="/register" className={styles.sectionMore}>
                See all <ChevronRight size={15} />
              </Link>
            </div>
            <Rail>
              {row.items.map((movie) => (
                <article
                  key={movie.id}
                  className={styles.card}
                  data-focusable
                  tabIndex={0}
                  data-reveal-child
                >
                  <button
                    type="button"
                    className={styles.cardArt}
                    onClick={() => play(movie)}
                    aria-label={`Play ${movie.title}`}
                  >
                    <RemoteImage src={movie.imageUrl} alt={movie.title} fill sizes="208px" />
                    <span className={styles.cardHover}>
                      <span className={styles.cardPlay}>
                        <Play size={16} fill="currentColor" />
                      </span>
                      <span className={styles.cardAdd}>
                        <Plus size={16} />
                      </span>
                    </span>
                  </button>
                  <h3 className={styles.cardTitle}>{movie.title}</h3>
                  <p className={styles.cardMeta}>
                    {movie.match}%
                    {movie.year && movie.year !== "—" ? ` · ${movie.year}` : ""}
                    {movie.tags[0] ? ` · ${movie.tags[0]}` : ""}
                  </p>
                </article>
              ))}
            </Rail>
          </section>
        ))}
      </div>

      {/* ═══════════ VALUE STRIP ═══════════ */}
      <section className={styles.value} data-reveal>
        {[
          {
            icon: <Play size={22} fill="currentColor" />,
            title: "Watch on any screen",
            body: "Phone, tablet, laptop, ultrawide and TV — the TV layout is fully drivable from a remote.",
          },
          {
            icon: <Volume2 size={22} />,
            title: "Subs and dubs",
            body: "Multi-language subtitle tracks with styling controls, and dubbed audio where the release has it.",
          },
          {
            icon: <Flame size={22} fill="currentColor" />,
            title: "Pick up where you left off",
            body: "Every episode remembers its position, and your list follows the account, not the device.",
          },
        ].map((item) => (
          <article key={item.title} className={styles.valueCard}>
            <span className={styles.valueIcon}>{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section id="faq" className={styles.faq} data-reveal>
        <h2 className={styles.faqHead}>Frequently asked questions</h2>
        <div className={styles.faqList}>
          {FAQ.map((item, i) => (
            <div key={item.q} className={styles.faqItem} data-open={openFaq === i}>
              <button
                type="button"
                className={styles.faqQ}
                aria-expanded={openFaq === i}
                onClick={() => setOpenFaq((cur) => (cur === i ? null : i))}
              >
                {item.q}
                <ChevronDown size={20} />
              </button>
              <div className={styles.faqA}>
                <p>{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ CLOSING CTA ═══════════ */}
      <section className={styles.cta} data-reveal>
        <h2>Ready when you are.</h2>
        <p>Create a free account and start the first episode in under a minute.</p>
        <div className={styles.ctaRow}>
          <Link href="/register" className={styles.playBtn} data-tap>
            Join free <ChevronRight size={18} />
          </Link>
          <Link href="/login" className={styles.infoBtn} data-tap>
            I already have an account
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 Anifire</span>
        <a href="#privacy">Privacy</a>
        <a href="#terms">Terms</a>
      </footer>
    </main>
  );
}

/**
 * Horizontal rail: snap scrolling for touch and remote, pager buttons for
 * pointer users only (a finger swipes, a D-pad moves focus — neither needs
 * arrows, and on touch they just steal space).
 */
function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({
    start: true,
    end: false,
  });

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft < 8,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8,
    });
  }, []);

  useEffect(() => {
    sync();
  }, [sync, children]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.86, behavior: "smooth" });
  };

  return (
    <div className={styles.rail}>
      <button
        type="button"
        className={`${styles.railBtn} ${styles.railPrev}`}
        onClick={() => page(-1)}
        disabled={edge.start}
        aria-label="Scroll left"
      >
        <ChevronLeft size={22} />
      </button>
      <div className={styles.railTrack} ref={ref} onScroll={sync}>
        {children}
      </div>
      <button
        type="button"
        className={`${styles.railBtn} ${styles.railNext}`}
        onClick={() => page(1)}
        disabled={edge.end}
        aria-label="Scroll right"
      >
        <ChevronRight size={22} />
      </button>
    </div>
  );
}
