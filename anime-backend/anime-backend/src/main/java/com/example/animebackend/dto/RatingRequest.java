package com.example.animebackend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/** Score bounds are enforced here and again by a CHECK constraint in the table. */
public record RatingRequest(@Min(1) @Max(10) int score, @Size(max = 500) String review) {}
