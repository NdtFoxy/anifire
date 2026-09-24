package com.example.animebackend.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.Category;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.CategoryRepository;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

/** English MAL genre names become Russian without ever showing a genre twice. */
@SpringBootTest
@ActiveProfiles("test")
class CategoryLocalizationTest {

    @Autowired CatalogImportService catalog;
    @Autowired CategoryRepository categories;
    @Autowired AnimeRepository animes;
    @Autowired TransactionTemplate tx;

    private Category cat(String name) {
        return categories.findByName(name).orElseGet(() -> categories.save(Category.builder().name(name).build()));
    }

    private List<String> genresOf(Long animeId) {
        return tx.execute(s -> animes.findById(animeId).orElseThrow().getCategories().stream()
                .filter(c -> !c.isDeleted())
                .map(Category::getName)
                .sorted()
                .toList());
    }

    @Test
    void renamesAndMergesIntoExistingRussianCategory() {
        Category drama = cat("Drama");
        Category horrorEn = cat("Horror");
        Category horrorRu = cat("Ужасы");
        Anime a = animes.save(Anime.builder().title("Loc A").categories(new LinkedHashSet<>(List.of(drama, horrorEn))).build());
        Anime b = animes.save(Anime.builder().title("Loc B").categories(new LinkedHashSet<>(List.of(horrorRu))).build());

        catalog.localizeCategories();

        assertThat(genresOf(a.getId())).containsExactly("Драма", "Ужасы");
        assertThat(genresOf(b.getId())).containsExactly("Ужасы");
        assertThat(categories.findAllByIsDeletedFalseOrderByNameAsc())
                .extracting(Category::getName)
                .contains("Драма", "Ужасы")
                .doesNotContain("Drama", "Horror");

        // Idempotent: a second pass has nothing left to do.
        assertThat(catalog.localizeCategories()).isZero();
    }
}
