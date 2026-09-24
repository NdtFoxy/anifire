package com.example.animebackend.controller;

import com.example.animebackend.dto.AnimeResponse;
import com.example.animebackend.service.RecommendationService;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RecommendationController {

    private final RecommendationService recommendations;

    public RecommendationController(RecommendationService recommendations) {
        this.recommendations = recommendations;
    }

    /** "Рекомендуем вам": personal, from ratings, bookmarks and history. */
    @GetMapping("/api/v1/me/recommendations")
    public List<AnimeResponse> forMe(
            @AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "20") int limit) {
        return recommendations.forUser(Long.valueOf(jwt.getSubject()), limit);
    }

    /** "Похожие": public, by shared genres. */
    @GetMapping("/api/v1/animes/{id}/similar")
    public List<AnimeResponse> similar(@PathVariable Long id, @RequestParam(defaultValue = "12") int limit) {
        return recommendations.similar(id, limit);
    }
}
