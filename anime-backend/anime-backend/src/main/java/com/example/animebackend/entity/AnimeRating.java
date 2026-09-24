package com.example.animebackend.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * A viewer's score for one title, 1–10.
 *
 * <p>Separate from {@link Anime#getRating()}: that is the catalogue's imported
 * score, this is what our own users think. Keeping them apart means an admin can
 * compare "what MAL says" with "what our audience says" instead of one silently
 * overwriting the other.
 */
@Entity
@Table(
        name = "anime_ratings",
        indexes = {
            @Index(name = "ux_anime_rating_slot", columnList = "userId,animeId", unique = true),
            @Index(name = "ix_anime_ratings_anime", columnList = "animeId")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnimeRating {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long animeId;

    @Column(nullable = false)
    private short score;

    @Column(length = 500)
    private String review;

    /** Country the score was cast from, for regional breakdowns. */
    @Column(length = 2)
    private String country;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
