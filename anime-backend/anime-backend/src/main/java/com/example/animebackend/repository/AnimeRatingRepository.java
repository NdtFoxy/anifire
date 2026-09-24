package com.example.animebackend.repository;

import com.example.animebackend.entity.AnimeRating;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AnimeRatingRepository extends JpaRepository<AnimeRating, Long> {

    Optional<AnimeRating> findByUserIdAndAnimeId(Long userId, Long animeId);

    List<AnimeRating> findByUserIdOrderByUpdatedAtDesc(Long userId);

    long countByUserId(Long userId);

    @Query("select avg(r.score) from AnimeRating r where r.userId = :userId")
    Double averageForUser(@Param("userId") Long userId);

    /** [userId, count] for a page of users — avoids N+1 in the directory. */
    @Query("select r.userId, count(r) from AnimeRating r where r.userId in :userIds group by r.userId")
    List<Object[]> countByRaters(@Param("userIds") Collection<Long> userIds);

    /** [animeId, avg, votes] for one country, best first. */
    @Query("select r.animeId, avg(r.score), count(r) from AnimeRating r "
            + "where r.country = :country "
            + "and (cast(:since as timestamp) is null or r.updatedAt > :since) "
            + "group by r.animeId order by avg(r.score) desc")
    List<Object[]> topRatedInCountry(
            @Param("country") String country, @Param("since") Instant since, Pageable pageable);

    @Query("select avg(r.score) from AnimeRating r where r.country = :country")
    Double averageForCountry(@Param("country") String country);

    /* ── abuse signals ── */

    /** [userId, count] for accounts that rated a lot in a short window. */
    @Query("select r.userId, count(r) from AnimeRating r where r.updatedAt > :since "
            + "group by r.userId having count(r) >= :threshold")
    List<Object[]> burstRaters(@Param("since") Instant since, @Param("threshold") long threshold);

    /** [userId, count, score] where every score from that account is identical. */
    @Query("select r.userId, count(r), min(r.score) from AnimeRating r group by r.userId "
            + "having count(r) >= :minimum and min(r.score) = max(r.score)")
    List<Object[]> uniformRaters(@Param("minimum") long minimum);
}
