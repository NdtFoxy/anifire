package com.example.animebackend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A heartbeat from the player. Bounds are deliberate: an episode index and a
 * position are attacker-controlled numbers, so they are clamped here rather than
 * trusted into the column.
 */
public record WatchProgressRequest(
        @NotBlank @Size(max = 120) String animeKey,
        @Size(max = 255) String animeTitle,
        @Min(0) @Max(10_000) int episode,
        @Min(0) @Max(200_000) int positionSeconds,
        @Min(0) @Max(200_000) Integer durationSeconds,
        @Size(max = 64) String provider) {}
