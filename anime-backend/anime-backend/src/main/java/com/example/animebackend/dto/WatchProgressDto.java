package com.example.animebackend.dto;

import com.example.animebackend.entity.WatchProgress;
import java.time.Instant;

/** Resume state the player reads back. */
public record WatchProgressDto(
        String animeKey,
        String animeTitle,
        int episode,
        int positionSeconds,
        Integer durationSeconds,
        boolean completed,
        String provider,
        Instant updatedAt) {

    public static WatchProgressDto from(WatchProgress p) {
        return new WatchProgressDto(
                p.getAnimeKey(),
                p.getAnimeTitle(),
                p.getEpisode(),
                p.getPositionSeconds(),
                p.getDurationSeconds(),
                p.isCompleted(),
                p.getProvider(),
                p.getUpdatedAt());
    }
}
