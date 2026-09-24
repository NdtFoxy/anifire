package com.example.animebackend.config;

import com.example.animebackend.catalog.CatalogImportService;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.service.CommentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Development seed: an empty database gets MAL's top 150 through the same import
 * the admin panel uses. Production disables this (StartupSafetyCheck) and fills
 * the catalogue from Admin → Каталог instead.
 */
@Configuration
@ConditionalOnProperty(name = "anifire.seed.enabled", havingValue = "true", matchIfMissing = true)
public class DataInitializer {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);
    private static final int SEED_PAGES = 6;

    @Bean
    CommandLineRunner initDatabase(
            AnimeRepository repository, CatalogImportService catalog, CommentService commentService) {
        return args -> {
            if (repository.count() == 0) {
                catalog.importNow(SEED_PAGES);
            } else {
                log.info("Catalogue already has data; skipping seed.");
            }
            // Demo comments (incl. an admin message) on Frieren — runs once.
            commentService.seedDemoComments();
        };
    }
}
