package com.example.animebackend.ops.dto;

import java.time.Instant;

/**
 * One thing worth a human look.
 *
 * @param severity {@code high} needs action now, {@code medium} is suspicious,
 *                 {@code low} is informational — the console sorts by this
 * @param kind     machine-readable signal id, stable across releases
 * @param subject  who or what it is about (account, country, endpoint)
 * @param detail   the evidence, in plain words
 * @param userId   the account involved, when the signal is about one
 */
public record SecuritySignal(
        String severity,
        String kind,
        String title,
        String subject,
        String detail,
        Long userId,
        long count,
        Instant at) {}
