package com.example.animebackend.repository;

import com.example.animebackend.entity.WatchEvent;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WatchEventRepository extends JpaRepository<WatchEvent, Long> {

    long countByWatchedAtAfter(Instant since);

    @Query("select count(distinct w.userId) from WatchEvent w")
    long countDistinctViewers();

    @Query("select count(distinct w.userId) from WatchEvent w where w.watchedAt > :since")
    long countDistinctViewersSince(@Param("since") Instant since);

    /** Top titles by total views: [animeKey, animeTitle, count]. */
    @Query(
            "select w.animeKey, max(w.animeTitle), count(w) as c "
                    + "from WatchEvent w group by w.animeKey order by c desc")
    List<Object[]> topAnime(Pageable pageable);

    /** Views per day for the last N days: [yyyy-mm-dd string, count]. */
    @Query(
            "select function('to_char', w.watchedAt, 'YYYY-MM-DD'), count(w) "
                    + "from WatchEvent w where w.watchedAt > :since "
                    + "group by function('to_char', w.watchedAt, 'YYYY-MM-DD') "
                    + "order by 1")
    List<Object[]> dailyCountsSince(@Param("since") Instant since);

    List<WatchEvent> findTop20ByOrderByWatchedAtDesc();

    /** Newest-first watch history for one user; page size caps the result. */
    List<WatchEvent> findByUserIdOrderByWatchedAtDesc(Long userId, Pageable pageable);

    /* ── per-country reporting ── */

    long countByCountry(String country);

    long countByCountryAndWatchedAtAfter(String country, Instant since);

    @Query("select count(distinct w.userId) from WatchEvent w "
            + "where w.country = :country and w.watchedAt > :since")
    long countDistinctViewersForCountrySince(
            @Param("country") String country, @Param("since") Instant since);

    /** [animeTitle, views] for one country, most watched first. */
    @Query("select max(w.animeTitle), count(w) as c from WatchEvent w "
            + "where w.country = :country "
            + "and (cast(:since as timestamp) is null or w.watchedAt > :since) "
            + "group by w.animeKey order by c desc")
    List<Object[]> topTitlesForCountry(
            @Param("country") String country, @Param("since") Instant since, Pageable pageable);

    /* ── admin directory ── */

    long countByUserId(Long userId);

    List<WatchEvent> findByUserIdInAndWatchedAtAfterOrderByWatchedAtDesc(
            java.util.Collection<Long> userIds, Instant since, Pageable pageable);

    @Query("select count(distinct w.animeKey) from WatchEvent w where w.userId = :userId")
    long countDistinctTitlesForUser(@Param("userId") Long userId);

    @Query("select min(w.watchedAt) from WatchEvent w where w.userId = :userId")
    Instant firstWatchFor(@Param("userId") Long userId);

    @Query("select max(w.watchedAt) from WatchEvent w where w.userId = :userId")
    Instant lastWatchFor(@Param("userId") Long userId);

    /** [userId, count] for a page of users. */
    @Query("select w.userId, count(w) from WatchEvent w where w.userId in :userIds group by w.userId")
    List<Object[]> countByViewers(@Param("userIds") java.util.Collection<Long> userIds);

    List<WatchEvent> findTop10ByUserIdOrderByWatchedAtDesc(Long userId);
}
