package com.example.animebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

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

    @Builder.Default
    private boolean isDeleted = false; // Logical deletion flag

    @Builder.Default
    private LocalDateTime creationDate = LocalDateTime.now(); // Record creation timestamp

    private Long creatorUserId; // User ID who created this record
}