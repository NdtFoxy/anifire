package com.example.animebackend.auth.dto;

import com.example.animebackend.entity.WatchEvent;
import java.time.Instant;

/** One "you watched this episode" row on the signed-in user's profile. */
public record WatchActivityDto(
        Long id,
        String animeKey,
        String animeTitle,
        int episode,
        String provider,
        Instant watchedAt) {

    public static WatchActivityDto from(WatchEvent e) {
        return new WatchActivityDto(
                e.getId(),
                e.getAnimeKey(),
                e.getAnimeTitle(),
                e.getEpisode(),
                e.getProvider(),
                e.getWatchedAt());
    }
}
