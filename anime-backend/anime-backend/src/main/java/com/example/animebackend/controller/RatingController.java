package com.example.animebackend.controller;

import com.example.animebackend.dto.RatingDto;
import com.example.animebackend.dto.RatingRequest;
import com.example.animebackend.geo.service.GeoAccessService;
import com.example.animebackend.service.RatingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** The signed-in viewer's own scores. Scoped to the JWT subject like all of /me. */
@RestController
@RequestMapping("/api/v1/me/ratings")
public class RatingController {

    private final RatingService ratings;
    private final GeoAccessService geo;

    public RatingController(RatingService ratings, GeoAccessService geo) {
        this.ratings = ratings;
        this.geo = geo;
    }

    @GetMapping
    public List<RatingDto> mine(@AuthenticationPrincipal Jwt jwt) {
        return ratings.forUser(Long.valueOf(jwt.getSubject()));
    }

    @PutMapping("/{animeId}")
    public RatingDto rate(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long animeId,
            @Valid @RequestBody RatingRequest body,
            HttpServletRequest request) {
        return ratings.rate(
                Long.valueOf(jwt.getSubject()), animeId, body, geo.resolveCountry(request));
    }

    @DeleteMapping("/{animeId}")
    public ResponseEntity<Void> clear(@AuthenticationPrincipal Jwt jwt, @PathVariable Long animeId) {
        ratings.clear(Long.valueOf(jwt.getSubject()), animeId);
        return ResponseEntity.noContent().build();
    }
}
