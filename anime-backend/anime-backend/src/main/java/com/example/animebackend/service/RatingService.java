package com.example.animebackend.service;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.dto.RatingDto;
import com.example.animebackend.dto.RatingRequest;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.AnimeRating;
import com.example.animebackend.repository.AnimeRatingRepository;
import com.example.animebackend.repository.AnimeRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Personal 1–10 scores for titles. One score per user and title, upserted. */
@Service
public class RatingService {

    private final AnimeRatingRepository ratings;
    private final AnimeRepository animes;

    public RatingService(AnimeRatingRepository ratings, AnimeRepository animes) {
        this.ratings = ratings;
        this.animes = animes;
    }

    @Transactional
    public RatingDto rate(Long userId, Long animeId, RatingRequest req, String country) {
        Anime anime = animes.findByIdAndIsDeletedFalse(animeId)
                .orElseThrow(() -> ApiException.badRequest("unknown_title", "That title does not exist."));
        AnimeRating row = ratings.findByUserIdAndAnimeId(userId, animeId)
                .orElseGet(() -> AnimeRating.builder().userId(userId).animeId(animeId).build());
        row.setScore((short) req.score());
        row.setReview(req.review() == null || req.review().isBlank() ? null : req.review().trim());
        if (country != null) row.setCountry(country);
        row.setUpdatedAt(Instant.now());
        AnimeRating saved = ratings.save(row);
        return toDto(saved, anime);
    }

    @Transactional
    public void clear(Long userId, Long animeId) {
        ratings.findByUserIdAndAnimeId(userId, animeId).ifPresent(ratings::delete);
    }

    @Transactional(readOnly = true)
    public List<RatingDto> forUser(Long userId) {
        List<AnimeRating> rows = ratings.findByUserIdOrderByUpdatedAtDesc(userId);
        if (rows.isEmpty()) return List.of();
        Map<Long, Anime> byId =
                animes.findAllById(rows.stream().map(AnimeRating::getAnimeId).toList()).stream()
                        .collect(Collectors.toMap(Anime::getId, Function.identity()));
        return rows.stream().map(r -> toDto(r, byId.get(r.getAnimeId()))).toList();
    }

    private static RatingDto toDto(AnimeRating row, Anime anime) {
        return new RatingDto(
                row.getAnimeId(),
                anime == null ? "Removed title" : anime.getTitle(),
                anime == null ? null : anime.getImageUrl(),
                row.getScore(),
                row.getReview(),
                row.getUpdatedAt());
    }
}
