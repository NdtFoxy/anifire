package com.example.animebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "animes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Anime {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long malId; // MyAnimeList original ID
    private String title;

    @Column(length = 2000)
    private String synopsis;

    private String imageUrl;
    private Double rating;

    // ── Enrichment (CatalogImportService): localized text and artwork resolved
    // once on the server instead of per visitor in the browser.
    private String titleRu;
    private String titleEn;

    @Column(length = 4000)
    private String synopsisRu;

    private Long anilistId;

    @Column(length = 600)
    private String coverUrl;

    @Column(length = 600)
    private String bannerUrl;

    private Integer seasonYear;

    /** Null until enrichment ran; the backfill picks those up. */
    private java.time.Instant enrichedAt;

    @ManyToMany
    @JoinTable(
            name = "anime_categories",
            joinColumns = @JoinColumn(name = "anime_id"),
            inverseJoinColumns = @JoinColumn(name = "category_id"))
    @Builder.Default
    private Set<Category> categories = new LinkedHashSet<>();

    @Builder.Default
    private boolean isDeleted = false; // Logical deletion flag

    @Builder.Default
    private LocalDateTime creationDate = LocalDateTime.now(); // Record creation timestamp

    private Long creatorUserId; // User ID who created this record
}
