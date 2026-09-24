package com.example.animebackend.ads.web;

import com.example.animebackend.ads.dto.AdDtos;
import com.example.animebackend.ads.service.AdEventService;
import com.example.animebackend.auth.security.RateLimiterService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Playback beacons from the ad overlay.
 *
 * Open by necessity: the viewers who see ads are the ones without an account. The
 * answer is always 204 — a beacon is fire-and-forget, the browser will not read a
 * body, and telling a caller that a decision id was unknown would only help someone
 * enumerate them.
 */
@RestController
@RequestMapping("/api/v1/ads")
public class AdEventController {

    private final AdEventService events;
    private final RateLimiterService rateLimiter;

    public AdEventController(AdEventService events, RateLimiterService rateLimiter) {
        this.events = events;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void record(@Valid @RequestBody AdDtos.EventRequest body, HttpServletRequest request) {
        // A pre-roll produces at most seven beacons; anything beyond a few hundred an
        // hour from one address is a script, not a viewer.
        if (!rateLimiter.allow("ads:events:" + clientIp(request), 300, Duration.ofHours(1))) {
            return;
        }
        events.record(body);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
