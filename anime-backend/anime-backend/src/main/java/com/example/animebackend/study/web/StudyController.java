package com.example.animebackend.study.web;

import com.example.animebackend.study.dto.ReviewDtos;
import com.example.animebackend.study.dto.StudyDtos;
import com.example.animebackend.study.service.ReviewService;
import com.example.animebackend.study.service.StudyService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * Learning endpoints.
 *
 * <p>Packs live under {@code /api/v1/study} because they are shared content, and
 * the personal parts under {@code /api/v1/me} where everything is scoped to the
 * JWT subject.
 */
@RestController
public class StudyController {

    private final StudyService study;
    private final ReviewService reviews;

    public StudyController(StudyService study, ReviewService reviews) {
        this.study = study;
        this.reviews = reviews;
    }

    /** Analyse this episode's subtitles (once, for everyone) and return the pack. */
    @PostMapping("/api/v1/study/packs")
    public StudyDtos.PackView build(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody StudyDtos.BuildRequest body) {
        return study.buildOrGet(userId(jwt), body);
    }

    @GetMapping("/api/v1/study/packs/{animeKey}/{episode}/{lang}")
    public ResponseEntity<StudyDtos.PackView> get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String animeKey,
            @PathVariable int episode,
            @PathVariable String lang) {
        return study.find(userId(jwt), animeKey, episode, lang)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/api/v1/me/languages")
    public List<StudyDtos.LanguageView> languages(@AuthenticationPrincipal Jwt jwt) {
        return study.languages(userId(jwt));
    }

    @PutMapping("/api/v1/me/languages")
    public StudyDtos.LanguageView setLanguage(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody StudyDtos.LanguageRequest body) {
        return study.setLanguage(userId(jwt), body);
    }

    @GetMapping("/api/v1/me/words")
    public List<StudyDtos.UserWordView> myWords(
            @AuthenticationPrincipal Jwt jwt, @RequestParam String lang) {
        return study.myWords(userId(jwt), lang);
    }

    @PutMapping("/api/v1/me/words/{lang}/{lemma}")
    public StudyDtos.UserWordView setWord(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String lang,
            @PathVariable String lemma,
            @Valid @RequestBody StudyDtos.WordRequest body) {
        return study.setWord(userId(jwt), lang, lemma, body);
    }

    /* ───────────────────────── review sessions ───────────────────────── */

    /** Cards whose time has come. Empty list simply means nothing is due. */
    @GetMapping("/api/v1/me/study/due")
    public List<ReviewDtos.Card> due(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam String lang,
            @RequestParam(defaultValue = "20") int limit) {
        return reviews.due(userId(jwt), lang, limit);
    }

    @PostMapping("/api/v1/me/study/review")
    public ReviewDtos.ReviewResult review(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReviewDtos.ReviewRequest body) {
        return reviews.review(userId(jwt), body);
    }

    @GetMapping("/api/v1/me/study/stats")
    public ReviewDtos.Stats stats(@AuthenticationPrincipal Jwt jwt, @RequestParam String lang) {
        return reviews.stats(userId(jwt), lang);
    }

    private static Long userId(Jwt jwt) {
        return jwt == null ? null : Long.valueOf(jwt.getSubject());
    }
}
