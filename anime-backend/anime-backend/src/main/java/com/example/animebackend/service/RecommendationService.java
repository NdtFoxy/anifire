package com.example.animebackend.service;

import com.example.animebackend.catalog.GenreNames;
import com.example.animebackend.dto.AnimeResponse;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.AnimeRating;
import com.example.animebackend.entity.Bookmark;
import com.example.animebackend.entity.Category;
import com.example.animebackend.entity.WatchEvent;
import com.example.animebackend.repository.AnimeRatingRepository;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.BookmarkRepository;
import com.example.animebackend.repository.WatchEventRepository;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Genre-affinity recommendations. Deliberately simple and explainable: the
 * viewer's taste is a weight per genre, built from what they rated highly,
 * bookmarked and watched; every unseen title scores the sum of its genres'
 * weights. "Топ аниме" is a list, not a genre, so it carries no signal.
 */
@Service
public class RecommendationService {

    /** Scores at or above this say "more like this"; lower ones push the genre down. */
    static final int LIKED_SCORE = 8;
    static final int DISLIKED_SCORE = 4;
    private static final int HISTORY = 200;

    private final AnimeRepository animes;
    private final AnimeRatingRepository ratings;
    private final BookmarkRepository bookmarks;
    private final WatchEventRepository watchEvents;

    public RecommendationService(
            AnimeRepository animes,
            AnimeRatingRepository ratings,
            BookmarkRepository bookmarks,
            WatchEventRepository watchEvents) {
        this.animes = animes;
        this.ratings = ratings;
        this.bookmarks = bookmarks;
        this.watchEvents = watchEvents;
    }

    @Transactional(readOnly = true)
    public List<AnimeResponse> forUser(Long userId, int limit) {
        Map<Long, Double> signal = new HashMap<>();
        Set<Long> seen = new HashSet<>();
        for (AnimeRating r : ratings.findByUserIdOrderByUpdatedAtDesc(userId)) {
            seen.add(r.getAnimeId());
            if (r.getScore() >= LIKED_SCORE) signal.merge(r.getAnimeId(), (double) (r.getScore() - LIKED_SCORE + 2), Double::sum);
            else if (r.getScore() <= DISLIKED_SCORE) signal.merge(r.getAnimeId(), -2.0, Double::sum);
        }
        for (Bookmark b : bookmarks.findByUserIdOrderByCreatedAtDesc(userId)) {
            seen.add(b.getAnimeId());
            signal.merge(b.getAnimeId(), 1.0, Double::sum);
        }
        for (WatchEvent e : watchEvents.findByUserIdOrderByWatchedAtDesc(userId, PageRequest.of(0, HISTORY))) {
            Long id = catalogId(e.getAnimeKey());
            if (id == null || !seen.add(id)) continue;
            signal.merge(id, 1.0, Double::sum);
        }
        if (signal.isEmpty()) return List.of();

        Map<Long, Double> genreWeight = new HashMap<>();
        for (Anime a : animes.findAllById(signal.keySet())) {
            double w = signal.get(a.getId());
            for (Category c : genres(a)) genreWeight.merge(c.getId(), w, Double::sum);
        }
        return rank(genreWeight, seen, limit);
    }

    /** Titles sharing the most genres with this one (the "Похожие" rail). */
    @Transactional(readOnly = true)
    public List<AnimeResponse> similar(Long animeId, int limit) {
        Anime anime = animes.findByIdAndIsDeletedFalse(animeId).orElse(null);
        if (anime == null) return List.of();
        Map<Long, Double> genreWeight = new HashMap<>();
        for (Category c : genres(anime)) genreWeight.put(c.getId(), 1.0);
        return rank(genreWeight, Set.of(animeId), limit);
    }

    private List<AnimeResponse> rank(Map<Long, Double> genreWeight, Set<Long> exclude, int limit) {
        if (genreWeight.isEmpty()) return List.of();
        record Scored(Anime anime, double score) {}
        return animes.findAllByIsDeletedFalse().stream()
                .filter(a -> !exclude.contains(a.getId()))
                .map(a -> new Scored(a, genres(a).stream()
                        .mapToDouble(c -> genreWeight.getOrDefault(c.getId(), 0.0))
                        .sum()))
                .filter(s -> s.score() > 0)
                .sorted(Comparator.comparingDouble(Scored::score).reversed()
                        .thenComparing(s -> s.anime().getRating() == null ? 0 : s.anime().getRating(),
                                Comparator.reverseOrder()))
                .limit(Math.min(Math.max(1, limit), 50))
                .map(s -> AnimeResponse.from(s.anime()))
                .toList();
    }

    private static List<Category> genres(Anime a) {
        return a.getCategories().stream()
                .filter(c -> !c.isDeleted() && !GenreNames.TOP.equals(c.getName()))
                .toList();
    }

    private static Long catalogId(String animeKey) {
        if (animeKey == null || !animeKey.chars().allMatch(Character::isDigit) || animeKey.isEmpty()) return null;
        try {
            return Long.valueOf(animeKey);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
