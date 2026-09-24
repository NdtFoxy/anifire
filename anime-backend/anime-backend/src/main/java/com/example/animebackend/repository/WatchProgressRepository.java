package com.example.animebackend.repository;

import com.example.animebackend.entity.WatchProgress;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WatchProgressRepository extends JpaRepository<WatchProgress, Long> {

    Optional<WatchProgress> findByUserIdAndAnimeKeyAndEpisode(
            Long userId, String animeKey, int episode);

    /** "Продолжить просмотр": unfinished slots, most recently touched first. */
    List<WatchProgress> findByUserIdAndCompletedFalseOrderByUpdatedAtDesc(
            Long userId, Pageable pageable);

    List<WatchProgress> findByUserIdAndAnimeKeyOrderByEpisodeAsc(Long userId, String animeKey);

    /* ── admin directory ── */

    @Query("select coalesce(sum(p.positionSeconds), 0) from WatchProgress p where p.userId = :userId")
    long watchedSecondsFor(@Param("userId") Long userId);

    long countByUserIdAndCompletedTrue(Long userId);
}
