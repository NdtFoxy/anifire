package com.example.animebackend.notification.repository;

import com.example.animebackend.notification.entity.Notification;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable page);

    long countByUserIdAndReadAtIsNull(Long userId);

    boolean existsByUserIdAndKindAndAnimeIdAndEpisode(
            Long userId, Notification.Kind kind, Long animeId, int episode);

    @Modifying
    @Query("update Notification n set n.readAt = :now where n.userId = :userId and n.readAt is null")
    int markAllRead(@Param("userId") Long userId, @Param("now") Instant now);
}
