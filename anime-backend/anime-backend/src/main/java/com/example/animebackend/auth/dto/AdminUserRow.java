package com.example.animebackend.auth.dto;

import java.time.Instant;

/**
 * One row of the admin user list. Deliberately flat and small: a directory of
 * thousands of accounts is scrolled and filtered, not read in full, so each row
 * carries only what the table shows and the detail view fetches the rest.
 */
public record AdminUserRow(
        Long id,
        String email,
        String displayName,
        String role,
        boolean emailVerified,
        boolean deleted,
        boolean locked,
        boolean adsFree,
        String plan,
        String signupCountry,
        long comments,
        long views,
        Instant lastLoginAt,
        Instant createdAt) {}
