package com.example.animebackend.service;

import com.example.animebackend.dto.JikanResponse;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.repository.AnimeRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class AnimeService {

    private final AnimeRepository repository;
    private final RestClient restClient;

    public AnimeService(AnimeRepository repository) {
        this.repository = repository;
        // Initialize the client with Jikan API base URL
        this.restClient = RestClient.create("https://api.jikan.moe/v4");
    }

    /**
     * Fetches top anime from Jikan API and saves them to the local database.
     */
    public void fetchAndSaveTopAnime() {
        System.out.println("⏳ Fetching data from Jikan API...");

        JikanResponse response = restClient.get()
                .uri("/top/anime")
                .retrieve()
                .body(JikanResponse.class);

        if (response != null && response.getData() != null) {
            // Mapping DTO to Entity using Java Streams
            List<Anime> animesToSave = response.getData().stream().map(jikanAnime ->
                    Anime.builder()
                            .malId(jikanAnime.getMalId())
                            .title(jikanAnime.getTitle())
                            .synopsis(jikanAnime.getSynopsis())
                            .rating(jikanAnime.getScore())
                            .imageUrl(jikanAnime.getImages().getJpg().getImageUrl())
                            .isDeleted(false)
                            .creationDate(java.time.LocalDateTime.now())
                            .build()
            ).collect(Collectors.toList());

            repository.saveAll(animesToSave);
            System.out.println("✅ Successfully seeded database with top anime data.");
        }
    }
}