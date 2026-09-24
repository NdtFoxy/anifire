package com.example.animebackend.auth.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Everything the console knows about one account, grouped the way an operator
 * asks about it: who they are, when things happened, how secure the account is,
 * and what they actually did.
 *
 * <p>Nothing here is inferred or padded — a value the platform does not record
 * is simply absent rather than estimated, so a number on this screen can always
 * be traced to a row in a table.
 */
public record AdminUserDetail(
        Profile profile,
        Timeline timeline,
        Security security,
        Engagement engagement,
        List<CommentPreview> recentComments,
        List<WatchPreview> recentWatches,
        List<SessionInfo> sessions,
        List<LinkedAccount> linkedAccounts,
        List<RatingEntry> ratings) {

    public record Profile(
            Long id,
            String email,
            String displayName,
            String role,
            String bio,
            String location,
            LocalDate birthday,
            String avatarUrl,
            String signupCountry,
            int level,
            int points,
            boolean deleted) {}

    public record Timeline(
            Instant createdAt,
            Instant updatedAt,
            Instant passwordChangedAt,
            Instant lastLoginAt,
            Instant firstWatchAt,
            Instant lastActivityAt) {}

    public record Security(
            boolean emailVerified,
            boolean locked,
            Instant lockedUntil,
            int failedAttempts,
            long activeSessions,
            boolean passwordNeverChanged) {}

    /**
     * @param watchedSeconds summed resume positions — the closest honest measure of
     *                       time actually spent watching; it counts each episode once
     *                       at its furthest point rather than every replay.
     */
    public record Engagement(
            long comments,
            long views,
            long distinctTitles,
            long watchedSeconds,
            long episodesCompleted,
            long bookmarks,
            long friends,
            long ratings,
            Double averageScore,
            boolean adsFree,
            String plan,
            Instant premiumUntil) {}

    public record CommentPreview(Long id, Long animeId, String animeTitle, String text, Instant at) {}

    public record WatchPreview(String animeKey, String animeTitle, int episode, Instant at) {}

    public record SessionInfo(String userAgent, String ipAddress, Instant createdAt, Instant expiresAt) {}

    public record LinkedAccount(String provider, Instant linkedAt, Instant lastLoginAt) {}

    /** What this viewer scored, newest first. */
    public record RatingEntry(
            Long animeId, String title, String imageUrl, int score, String review, Instant at) {}
}
