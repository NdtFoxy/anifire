package com.example.animebackend.dto;

import java.time.Instant;

/**
 * A friend or a pending request. Only public profile fields are exposed — email
 * and account state stay private even between friends.
 */
public record FriendDto(
        Long friendshipId,
        Long userId,
        String displayName,
        String avatarUrl,
        int level,
        String status,
        /** True when the signed-in user received this request rather than sent it. */
        boolean incoming,
        Instant since) {}
