package com.example.animebackend.auth.dto;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.billing.service.Entitlement;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Full profile view for the signed-in user's profile page. {@code adsFree}/{@code plan}/
 * {@code premiumUntil} mirror the server-resolved {@link Entitlement} so the page can
 * render the subscription state — they are never trusted for ad decisions.
 */
public record ProfileDto(
        Long id,
        String email,
        String displayName,
        String role,
        boolean emailVerified,
        String bio,
        String location,
        LocalDate birthday,
        String avatarUrl,
        String bannerUrl,
        int level,
        int points,
        int profileViews,
        int likes,
        int friends,
        int posts,
        int commentsCount,
        Instant createdAt,
        Instant lastLoginAt,
        boolean adsFree,
        String plan,
        Instant premiumUntil) {

    public static ProfileDto from(AppUser u, Entitlement entitlement) {
        return new ProfileDto(
                u.getId(),
                u.getEmail(),
                u.getDisplayName(),
                u.getRole().name(),
                u.isEmailVerified(),
                u.getBio(),
                u.getLocation(),
                u.getBirthday(),
                u.getAvatarUrl(),
                u.getBannerUrl(),
                u.getLevel(),
                u.getPoints(),
                u.getProfileViews(),
                u.getLikes(),
                u.getFriends(),
                u.getPosts(),
                u.getCommentsCount(),
                u.getCreatedAt(),
                u.getLastLoginAt(),
                entitlement.adsFree(),
                entitlement.plan() == null ? null : entitlement.plan().name(),
                entitlement.premiumUntil());
    }
}
