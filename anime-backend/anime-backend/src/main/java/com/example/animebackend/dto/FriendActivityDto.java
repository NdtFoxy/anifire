package com.example.animebackend.dto;

import java.time.Instant;

/** One line of the friends feed: a friend's latest episode of a title. */
public record FriendActivityDto(
        Long userId,
        String displayName,
        String avatarUrl,
        String animeKey,
        String animeTitle,
        int episode,
        Instant watchedAt) {}
