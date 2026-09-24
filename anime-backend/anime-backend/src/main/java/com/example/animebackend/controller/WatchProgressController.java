package com.example.animebackend.controller;

import com.example.animebackend.auth.security.RateLimiterService;
import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.dto.WatchProgressDto;
import com.example.animebackend.dto.WatchProgressRequest;
import com.example.animebackend.service.WatchProgressService;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * Resume positions for the signed-in viewer. Everything is scoped to the JWT
 * subject — there is no user id in any path, so one account can never read or
 * write another's progress.
 */
@RestController
@RequestMapping("/api/v1/me/progress")
public class WatchProgressController {

    private final WatchProgressService progress;
    private final RateLimiterService rateLimiter;

    public WatchProgressController(WatchProgressService progress, RateLimiterService rateLimiter) {
        this.progress = progress;
        this.rateLimiter = rateLimiter;
    }

    /** Player heartbeat. Idempotent per slot: the same position twice is a no-op. */
    @PutMapping
    public WatchProgressDto save(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody WatchProgressRequest body) {
        Long userId = userId(jwt);
        // A heartbeat every ~10s needs ~6/min; 120 leaves room for several tabs and
        // still caps a runaway client.
        if (!rateLimiter.allow("progress:" + userId, 120, Duration.ofMinutes(1))) {
            throw ApiException.tooManyRequests("Slow down.");
        }
        return progress.save(userId, body);
    }

    @GetMapping
    public List<WatchProgressDto> continueWatching(
            @AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "20") int limit) {
        return progress.continueWatching(userId(jwt), limit);
    }

    /** Exact slot, used by the player before it starts a source. */
    @GetMapping("/{animeKey}/{episode}")
    public ResponseEntity<WatchProgressDto> one(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String animeKey,
            @PathVariable int episode) {
        return progress.find(userId(jwt), animeKey, episode)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** Every episode of one title, for ticking off a season list. */
    @GetMapping("/{animeKey}")
    public List<WatchProgressDto> forTitle(
            @AuthenticationPrincipal Jwt jwt, @PathVariable String animeKey) {
        return progress.forTitle(userId(jwt), animeKey);
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
