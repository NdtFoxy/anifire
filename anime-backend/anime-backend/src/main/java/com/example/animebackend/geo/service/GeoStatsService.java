package com.example.animebackend.geo.service;

import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.geo.dto.CountryStats;
import com.example.animebackend.repository.AnimeRatingRepository;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.WatchEventRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Per-country numbers for the regions panel.
 *
 * <p>Everything is derived from data the server attributed itself
 * ({@code app_users.signup_country}, {@code watch_events.country}) — a client
 * cannot inflate a country's figures by claiming to be there, because the country
 * only ever comes from the trusted proxy header.
 *
 * <p>Rows written before country attribution existed simply have none; they are
 * reported separately as "unattributed" instead of being silently folded into
 * whichever country is being inspected.
 */
@Service
public class GeoStatsService {

    /** A viewer counts as "watching now" if their last event is this fresh. */
    private static final Duration LIVE_WINDOW = Duration.ofMinutes(15);

    private final AppUserRepository users;
    private final WatchEventRepository events;
    private final GeoAccessService geo;
    private final AnimeRatingRepository ratings;
    private final AnimeRepository animes;

    public GeoStatsService(
            AppUserRepository users,
            WatchEventRepository events,
            GeoAccessService geo,
            AnimeRatingRepository ratings,
            AnimeRepository animes) {
        this.users = users;
        this.events = events;
        this.geo = geo;
        this.ratings = ratings;
        this.animes = animes;
    }

    private String titleOf(Long animeId) {
        return animes.findById(animeId).map(a -> a.getTitle()).orElse("Удалённый тайтл");
    }

    @Transactional(readOnly = true)
    public CountryStats forCountry(String rawCode, String period) {
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase();
        Instant now = Instant.now();
        Instant day = now.minus(Duration.ofDays(1));
        Instant week = now.minus(Duration.ofDays(7));
        Instant month = now.minus(Duration.ofDays(30));

        CountryStats.Buckets signups = new CountryStats.Buckets(
                users.countBySignupCountryAndCreatedAtAfter(code, day),
                users.countBySignupCountryAndCreatedAtAfter(code, week),
                users.countBySignupCountryAndCreatedAtAfter(code, month),
                users.countBySignupCountry(code));

        CountryStats.Buckets views = new CountryStats.Buckets(
                events.countByCountryAndWatchedAtAfter(code, day),
                events.countByCountryAndWatchedAtAfter(code, week),
                events.countByCountryAndWatchedAtAfter(code, month),
                events.countByCountry(code));

        // The "top titles" list follows the period the operator picked, so the panel
        // can answer "what is hot there this week" as well as "all time".
        Instant since = switch (period == null ? "all" : period) {
            case "24h" -> day;
            case "7d" -> week;
            case "30d" -> month;
            default -> null;
        };

        List<CountryStats.TitleCount> top =
                events.topTitlesForCountry(code, since, PageRequest.of(0, 5)).stream()
                        .map(row -> new CountryStats.TitleCount(
                                (String) row[0], ((Number) row[1]).longValue()))
                        .toList();

        return new CountryStats(
                code,
                geo.blockedCountries().contains(code),
                signups,
                events.countDistinctViewersForCountrySince(code, now.minus(LIVE_WINDOW)),
                views,
                top,
                ratings.topRatedInCountry(code, since, PageRequest.of(0, 5)).stream()
                        .map(row -> new CountryStats.RatedTitle(
                                ((Number) row[0]).longValue(),
                                titleOf(((Number) row[0]).longValue()),
                                Math.round(((Number) row[1]).doubleValue() * 10) / 10.0,
                                ((Number) row[2]).longValue()))
                        .toList(),
                ratings.averageForCountry(code),
                period == null ? "all" : period,
                geo.refusalsByCountry().getOrDefault(code, 0L),
                users.findTopBySignupCountryOrderByCreatedAtDesc(code)
                        .map(u -> u.getCreatedAt())
                        .orElse(null),
                users.countBySignupCountryIsNotNull(),
                users.countBySignupCountryIsNull());
    }
}
