package com.example.animebackend.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * Where a viewer stopped, per title and episode.
 *
 * <p>Distinct from {@link WatchEvent}: that table is an append-only log for
 * analytics, this one is mutable current state ("resume at 14:32"). Mixing them
 * would either bloat the log with a row every few seconds or lose the history.
 */
@Entity
@Table(
        name = "watch_progress",
        indexes = {
            @Index(name = "ux_watch_progress_slot", columnList = "userId,animeKey,episode", unique = true),
            @Index(name = "ix_watch_progress_recent", columnList = "userId,completed,updatedAt")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WatchProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    /** Catalogue id or slug — whatever the player used to resolve the source. */
    @Column(nullable = false, length = 120)
    private String animeKey;

    private String animeTitle;

    @Column(nullable = false)
    private int episode;

    @Column(nullable = false)
    private int positionSeconds;

    private Integer durationSeconds;

    @Builder.Default
    @Column(nullable = false)
    private boolean completed = false;

    @Column(length = 64)
    private String provider;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
