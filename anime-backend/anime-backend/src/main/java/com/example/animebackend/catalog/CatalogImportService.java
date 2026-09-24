package com.example.animebackend.catalog;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.dto.JikanResponse;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.Category;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.CategoryRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Fills and localizes the catalogue from public sources, on demand from the admin
 * panel (and once at dev start-up when the database is empty).
 *
 * Import: MAL's top list via Jikan; titles already present (by MAL id) are skipped,
 * so a re-run only adds what is new. Enrichment: Russian title and synopsis from
 * Shikimori, artwork / English title / season from AniList, stored on the row so
 * list pages never have to ask AniList from the visitor's browser.
 *
 * One job at a time: the sources rate-limit per server IP, so two parallel runs
 * would only slow each other into 429s.
 */
@Service
public class CatalogImportService {

    private static final Logger log = LoggerFactory.getLogger(CatalogImportService.class);
    public static final int MAX_PAGES = 20;

    public enum Kind { IMPORT, ENRICH }

    public record Status(
            Kind kind, boolean running, int processed, int total, int added, int enriched, int failed,
            Instant startedAt, Instant finishedAt, String error) {
        static Status idle() {
            return new Status(null, false, 0, 0, 0, 0, 0, null, null, null);
        }
    }

    private final AnimeRepository animes;
    private final CategoryRepository categories;
    private final CatalogSources sources;
    private final TransactionTemplate tx;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "catalog-import");
        t.setDaemon(true);
        return t;
    });
    private final AtomicReference<Status> status = new AtomicReference<>(Status.idle());

    public CatalogImportService(
            AnimeRepository animes, CategoryRepository categories, CatalogSources sources, TransactionTemplate tx) {
        this.animes = animes;
        this.categories = categories;
        this.sources = sources;
        this.tx = tx;
    }

    public Status status() {
        return status.get();
    }

    /** Starts an import of {@code pages} top-list pages (25 titles each) in the background. */
    public Status startImport(int pages) {
        int safe = Math.min(Math.max(1, pages), MAX_PAGES);
        return start(Kind.IMPORT, safe * 25, () -> runImport(safe));
    }

    /** Starts enrichment of every title that has not been enriched yet. */
    public Status startEnrichment() {
        List<Long> ids = animes.findIdsNeedingEnrichment();
        return start(Kind.ENRICH, ids.size(), () -> enrichAll(ids));
    }

    /** Synchronous import + enrichment, for the dev seed on an empty database. */
    public void importNow(int pages) {
        Status begun = start(Kind.IMPORT, pages * 25, null);
        if (!begun.running()) return;
        runImport(pages);
    }

    private Status start(Kind kind, int total, Runnable job) {
        Status next = new Status(kind, true, 0, total, 0, 0, 0, Instant.now(), null, null);
        Status prev = status.getAndUpdate(s -> s.running() ? s : next);
        if (prev.running()) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT, "import_running",
                    "Импорт уже идёт — дождитесь окончания.");
        }
        if (job != null) worker.execute(job);
        return next;
    }

    private void runImport(int pages) {
        try {
            localizeCategories();
            for (int page = 1; page <= pages; page++) {
                List<JikanResponse.JikanAnime> batch = sources.topPage(page);
                if (batch.isEmpty()) break; // past the end of the list
                for (JikanResponse.JikanAnime j : batch) {
                    Long id = tx.execute(s -> insertIfNew(j));
                    boolean added = id != null;
                    boolean enriched = added && enrich(id);
                    bump(added, enriched, false);
                }
            }
            finish(null);
        } catch (RuntimeException e) {
            log.warn("Catalogue import failed: {}", e.toString());
            finish(e.getMessage());
        }
    }

    private void enrichAll(List<Long> ids) {
        try {
            localizeCategories();
            for (Long id : ids) {
                boolean ok = enrich(id);
                bump(false, ok, !ok);
            }
            finish(null);
        } catch (RuntimeException e) {
            finish(e.getMessage());
        }
    }

    /** Creates the title unless one with this MAL id exists; returns the new id or null. */
    private Long insertIfNew(JikanResponse.JikanAnime j) {
        if (j.getMalId() == null || animes.existsByMalIdAndIsDeletedFalse(j.getMalId())) return null;
        LinkedHashSet<Category> cats = new LinkedHashSet<>();
        cats.add(category(GenreNames.TOP));
        for (List<JikanResponse.JikanAnime.Genre> group : List.of(
                nullSafe(j.getGenres()), nullSafe(j.getThemes()), nullSafe(j.getDemographics()))) {
            for (JikanResponse.JikanAnime.Genre g : group) {
                if (g.getName() != null && !g.getName().isBlank()) cats.add(category(GenreNames.ru(g.getName().trim())));
            }
        }
        String image = j.getImages() == null || j.getImages().getJpg() == null ? null : j.getImages().getJpg().getImageUrl();
        Anime anime = animes.save(Anime.builder()
                .malId(j.getMalId())
                .title(j.getTitle())
                .synopsis(truncate(j.getSynopsis(), 2000))
                .rating(j.getScore())
                .imageUrl(image)
                .seasonYear(j.getYear())
                .categories(cats)
                .isDeleted(false)
                .creationDate(LocalDateTime.now())
                .build());
        return anime.getId();
    }

    /** Pulls Russian text and artwork for one title; network calls happen outside any transaction. */
    boolean enrich(Long animeId) {
        Anime snapshot = animes.findById(animeId).orElse(null);
        if (snapshot == null || snapshot.getMalId() == null) return false;
        long malId = snapshot.getMalId();
        var russian = sources.russian(malId);
        var art = sources.artwork(malId);
        if (russian.isEmpty() && art.isEmpty()) return false;
        tx.executeWithoutResult(s -> animes.findById(animeId).ifPresent(a -> {
            russian.ifPresent(r -> {
                if (r.title() != null) a.setTitleRu(r.title());
                if (r.synopsis() != null) a.setSynopsisRu(truncate(r.synopsis(), 4000));
            });
            art.ifPresent(w -> {
                a.setAnilistId(w.anilistId());
                if (w.titleEn() != null) a.setTitleEn(w.titleEn());
                if (w.cover() != null) a.setCoverUrl(w.cover());
                if (w.banner() != null) a.setBannerUrl(w.banner());
                if (w.seasonYear() != null) a.setSeasonYear(w.seasonYear());
            });
            a.setEnrichedAt(Instant.now());
        }));
        return true;
    }

    /**
     * Renames categories created with MAL's English names. Where the Russian name
     * already exists (names are unique), titles move over and the English row is
     * retired, so the catalogue never shows the same genre twice.
     */
    public int localizeCategories() {
        Integer changed = tx.execute(s -> {
            int n = 0;
            for (Map.Entry<String, String> e : GenreNames.all().entrySet()) {
                Category english = categories.findByName(e.getKey()).orElse(null);
                if (english == null || english.getName().equals(e.getValue())) continue;
                Category russian = categories.findByName(e.getValue()).orElse(null);
                if (russian == null) {
                    english.setName(e.getValue());
                } else {
                    for (Anime a : animes.findByCategoriesContains(english)) {
                        a.getCategories().remove(english);
                        a.getCategories().add(russian);
                    }
                    russian.setDeleted(false);
                    english.setDeleted(true);
                    english.setName(e.getKey() + " (устар.)");
                }
                n++;
            }
            return n;
        });
        return changed == null ? 0 : changed;
    }

    private Category category(String name) {
        return categories.findByName(name)
                .map(c -> {
                    c.setDeleted(false);
                    return c;
                })
                .orElseGet(() -> categories.save(Category.builder().name(name).build()));
    }

    private void bump(boolean added, boolean enriched, boolean failed) {
        status.updateAndGet(s -> new Status(s.kind(), s.running(), s.processed() + 1, Math.max(s.total(), s.processed() + 1),
                s.added() + (added ? 1 : 0), s.enriched() + (enriched ? 1 : 0), s.failed() + (failed ? 1 : 0),
                s.startedAt(), s.finishedAt(), s.error()));
    }

    private void finish(String error) {
        Status done = status.updateAndGet(s -> new Status(s.kind(), false, s.processed(), s.total(), s.added(),
                s.enriched(), s.failed(), s.startedAt(), Instant.now(), error));
        log.info("Catalogue {} finished: processed={} added={} enriched={} failed={} error={}",
                done.kind(), done.processed(), done.added(), done.enriched(), done.failed(), error);
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
