package com.example.animebackend.library;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.animebackend.dto.AnimeResponse;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.AnimeRating;
import com.example.animebackend.entity.Category;
import com.example.animebackend.repository.AnimeRatingRepository;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.CategoryRepository;
import com.example.animebackend.service.RecommendationService;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Recommendations follow what the viewer liked and never repeat what they have seen. */
@SpringBootTest
@ActiveProfiles("test")
class RecommendationTest {

    @Autowired RecommendationService recommendations;
    @Autowired AnimeRepository animes;
    @Autowired CategoryRepository categories;
    @Autowired AnimeRatingRepository ratings;

    private final long viewer = 700_001L;

    private Category cat(String name) {
        return categories.findByName(name).orElseGet(() -> categories.save(Category.builder().name(name).build()));
    }

    private Anime title(String name, double rating, Category... cats) {
        return animes.save(Anime.builder().title(name).rating(rating).categories(new LinkedHashSet<>(List.of(cats))).build());
    }

    @Test
    void likedGenresRankFirstAndRatedTitlesAreExcluded() {
        String tag = "R" + System.nanoTime();
        Category mecha = cat(tag + "-mecha");
        Category romance = cat(tag + "-romance");
        Anime liked = title(tag + " liked", 8.0, mecha);
        Anime disliked = title(tag + " disliked", 8.0, romance);
        Anime moreMecha = title(tag + " more mecha", 7.0, mecha);
        Anime moreRomance = title(tag + " more romance", 9.9, romance);
        ratings.save(AnimeRating.builder().userId(viewer).animeId(liked.getId()).score((short) 10).build());
        ratings.save(AnimeRating.builder().userId(viewer).animeId(disliked.getId()).score((short) 2).build());

        List<String> titles = recommendations.forUser(viewer, 50).stream().map(AnimeResponse::title).toList();

        assertThat(titles).contains(moreMecha.getTitle())
                // Disliked genre scores below zero, so it is not recommended despite its 9.9.
                .doesNotContain(moreRomance.getTitle(), liked.getTitle(), disliked.getTitle());
    }

    @Test
    void similarSharesGenresAndSkipsItself() {
        String tag = "S" + System.nanoTime();
        Category horror = cat(tag + "-horror");
        Category sports = cat(tag + "-sports");
        Anime base = title(tag + " base", 8.0, horror);
        Anime near = title(tag + " near", 7.0, horror, sports);
        Anime far = title(tag + " far", 9.0, sports);

        List<String> titles = recommendations.similar(base.getId(), 50).stream().map(AnimeResponse::title).toList();

        assertThat(titles).contains(near.getTitle()).doesNotContain(base.getTitle(), far.getTitle());
    }
}
