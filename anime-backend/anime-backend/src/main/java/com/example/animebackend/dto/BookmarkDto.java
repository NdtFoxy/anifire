package com.example.animebackend.dto;

import java.time.Instant;

/** A saved title, flattened with just enough catalogue data to render a card. */
public record BookmarkDto(
        Long animeId,
        String title,
        String imageUrl,
        Double rating,
        Instant createdAt) {}
