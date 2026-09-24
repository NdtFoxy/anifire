package com.example.animebackend.catalog;

import com.example.animebackend.dto.JikanResponse;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * The three public catalogues an import reads, each behind its own pacing:
 * Jikan (MAL top list), Shikimori (Russian titles and synopses, keyed by the MAL
 * id) and AniList (artwork, English title, season year). All three rate-limit
 * aggressively; the pauses below keep a full import inside their published limits
 * so it never has to recover from a ban mid-run.
 */
@Component
public class CatalogSources {

    private static final Logger log = LoggerFactory.getLogger(CatalogSources.class);
    private static final String USER_AGENT = "Anifire/1.0 (catalogue import)";
    private static final Pattern BBCODE = Pattern.compile("\\[/?[a-z_]+(=[^\\]]*)?\\]");

    /** Jikan ~3 req/s, Shikimori 90 req/min, AniList currently 30 req/min. */
    static final Duration JIKAN_PACE = Duration.ofMillis(700);
    static final Duration SHIKIMORI_PACE = Duration.ofMillis(700);
    static final Duration ANILIST_PACE = Duration.ofMillis(2100);

    private final RestClient jikan;
    private final RestClient shikimori;
    private final RestClient anilist;

    public CatalogSources() {
        SimpleClientHttpRequestFactory http = new SimpleClientHttpRequestFactory();
        http.setConnectTimeout(Duration.ofSeconds(5));
        http.setReadTimeout(Duration.ofSeconds(20));
        this.jikan = RestClient.builder().requestFactory(http).baseUrl("https://api.jikan.moe/v4")
                .defaultHeader("User-Agent", USER_AGENT).build();
        this.shikimori = RestClient.builder().requestFactory(http).baseUrl("https://shikimori.io/api")
                .defaultHeader("User-Agent", USER_AGENT).build();
        this.anilist = RestClient.builder().requestFactory(http).baseUrl("https://graphql.anilist.co")
                .defaultHeader("User-Agent", USER_AGENT).build();
    }

    /**
     * One page of MAL's top list (25 titles); empty past the last page.
     *
     * @throws IllegalStateException when Jikan (or MAL behind it) keeps failing,
     *         so a partial import reports why it stopped instead of looking finished
     */
    public List<JikanResponse.JikanAnime> topPage(int page) {
        JikanResponse body = withRetry("Jikan top page " + page, JIKAN_PACE, () -> jikan.get()
                .uri(uri -> uri.path("/top/anime").queryParam("page", page).build())
                .retrieve()
                .body(JikanResponse.class));
        if (body == null) {
            throw new IllegalStateException("Jikan/MyAnimeList не отвечает (страница " + page + "), попробуйте позже");
        }
        return body.getData() == null ? List.of() : body.getData();
    }

    public record RussianInfo(String title, String synopsis) {}

    public Optional<RussianInfo> russian(long malId) {
        ShikimoriAnime a = withRetry("Shikimori " + malId, SHIKIMORI_PACE, () -> shikimori.get()
                .uri("/animes/{id}", malId)
                .retrieve()
                .body(ShikimoriAnime.class));
        if (a == null) return Optional.empty();
        String title = blankToNull(a.russian());
        String synopsis = a.description() == null ? null
                : blankToNull(BBCODE.matcher(a.description()).replaceAll("").strip());
        return title == null && synopsis == null ? Optional.empty() : Optional.of(new RussianInfo(title, synopsis));
    }

    public record Artwork(Long anilistId, String titleEn, String cover, String banner, Integer seasonYear) {}

    public Optional<Artwork> artwork(long malId) {
        AniListEnvelope body = withRetry("AniList " + malId, ANILIST_PACE, () -> anilist.post()
                .header("Content-Type", "application/json")
                .body(Map.of(
                        "query", "query($idMal:Int){Media(idMal:$idMal,type:ANIME){id seasonYear bannerImage "
                                + "coverImage{extraLarge large} title{english}}}",
                        "variables", Map.of("idMal", malId)))
                .retrieve()
                .body(AniListEnvelope.class));
        AniListMedia m = body == null || body.data() == null ? null : body.data().Media();
        if (m == null) return Optional.empty();
        String cover = m.coverImage() == null ? null
                : m.coverImage().extraLarge() != null ? m.coverImage().extraLarge() : m.coverImage().large();
        return Optional.of(new Artwork(m.id(), m.title() == null ? null : blankToNull(m.title().english()),
                cover, m.bannerImage(), m.seasonYear()));
    }

    /**
     * Paces every call, retries 429/5xx with backoff, and treats 404 as "no such
     * title" rather than an error. Returns null when the source gives up.
     */
    private <T> T withRetry(String what, Duration pace, java.util.function.Supplier<T> call) {
        for (int attempt = 1; attempt <= 4; attempt++) {
            pause(pace.multipliedBy(attempt == 1 ? 1 : 1L << attempt));
            try {
                return call.get();
            } catch (HttpClientErrorException.NotFound e) {
                return null;
            } catch (RuntimeException e) {
                log.warn("{} attempt {}/4 failed: {}", what, attempt, e.getMessage());
            }
        }
        return null;
    }

    private static void pause(Duration d) {
        try {
            Thread.sleep(d);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted", e);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ShikimoriAnime(String russian, String description) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record AniListEnvelope(AniListData data) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record AniListData(AniListMedia Media) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record AniListMedia(Long id, Integer seasonYear, String bannerImage, Cover coverImage, Title title) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Cover(String extraLarge, String large) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Title(String english) {}
}
