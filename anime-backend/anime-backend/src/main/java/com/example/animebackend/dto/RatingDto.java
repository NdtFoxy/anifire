package com.example.animebackend.dto;

import java.time.Instant;

/** One personal score, with enough catalogue data to render it anywhere. */
public record RatingDto(
        Long animeId,
        String title,
        String imageUrl,
        int score,
        String review,
        Instant updatedAt) {}
