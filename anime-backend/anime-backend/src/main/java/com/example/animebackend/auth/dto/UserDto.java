package com.example.animebackend.auth.dto;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.billing.service.Entitlement;
import java.time.Instant;

/**
 * User payload returned by login/refresh/me. {@code adsFree}/{@code plan}/
 * {@code premiumUntil} mirror the server-resolved {@link Entitlement} so the client
 * can render the right UI — they are never trusted for ad decisions.
 */
public record UserDto(
        Long id,
        String email,
        String displayName,
        String role,
        boolean emailVerified,
        boolean adsFree,
        String plan,
        Instant premiumUntil) {

    public static UserDto from(AppUser u, Entitlement entitlement) {
        return new UserDto(
                u.getId(),
                u.getEmail(),
                u.getDisplayName(),
                u.getRole().name(),
                u.isEmailVerified(),
                entitlement.adsFree(),
                entitlement.plan() == null ? null : entitlement.plan().name(),
                entitlement.premiumUntil());
    }
}
