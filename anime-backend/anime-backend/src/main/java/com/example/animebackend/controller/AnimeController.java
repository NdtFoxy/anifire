package com.example.animebackend.controller;

import com.example.animebackend.entity.Anime;
import com.example.animebackend.repository.AnimeRepository;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/animes")
@CrossOrigin(origins = "http://localhost:3000") // Enabling CORS for Next.js
public class AnimeController {

    private final AnimeRepository repository;

    public AnimeController(AnimeRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<Anime> getAllAnimes() {
        // Only return records that are not marked as deleted
        return repository.findAllByIsDeletedFalse();
    }

    @DeleteMapping("/{id}")
    public void deleteAnime(@PathVariable Long id) {
        Anime anime = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Anime not found with id: " + id));

        anime.setDeleted(true); // Logical deletion
        repository.save(anime);
        System.out.println("❌ Anime marked as deleted: ID " + id);
    }
}