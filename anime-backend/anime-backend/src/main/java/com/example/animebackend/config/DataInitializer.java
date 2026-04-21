package com.example.animebackend.config;

import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.service.AnimeService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataInitializer {

    @Bean
    CommandLineRunner initDatabase(AnimeRepository repository, AnimeService animeService) {
        return args -> {
            // If the database is empty - seed it from Jikan
            if (repository.count() == 0) {
                animeService.fetchAndSaveTopAnime();
            } else {
                System.out.println("⚡ Database already has data. Skipping initialization.");
            }
        };
    }
}