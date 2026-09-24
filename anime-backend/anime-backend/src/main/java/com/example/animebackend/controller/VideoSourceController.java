package com.example.animebackend.controller;

import com.example.animebackend.ads.service.AdDecisionService;
import com.example.animebackend.dto.PlayerSourceResponse;
import com.example.animebackend.geo.service.GeoAccessService;
import com.example.animebackend.service.VideoSourceService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/animes")
public class VideoSourceController {

    private final VideoSourceService service;
    private final AdDecisionService ads;
    private final GeoAccessService geo;

    public VideoSourceController(VideoSourceService service, AdDecisionService ads, GeoAccessService geo) {
        this.service = service;
        this.ads = ads;
        this.geo = geo;
    }

    /**
     * The player payload, including whether an ad airs first.
     *
     * Stays open to anonymous callers — a guest must be able to watch — but reads the
     * bearer when there is one, because that is the only way to recognise a paying
     * viewer. The entitlement itself is re-read from the database inside
     * {@link AdDecisionService}: the token's {@code adsFree} claim has a 15-minute
     * TTL and is a UI hint, never an authority on what the server serves.
     */
    @GetMapping("/{animeId}/episodes/{episode}/source")
    public PlayerSourceResponse source(
            @PathVariable Long animeId,
            @PathVariable int episode,
            @AuthenticationPrincipal Jwt jwt,
            HttpServletRequest request) {
        PlayerSourceResponse source = service.source(animeId, episode);
        Long userId = jwt == null ? null : Long.valueOf(jwt.getSubject());
        return source.withAdPlan(
                ads.planFor(userId, String.valueOf(animeId), episode, geo.resolveCountry(request)));
    }
}
