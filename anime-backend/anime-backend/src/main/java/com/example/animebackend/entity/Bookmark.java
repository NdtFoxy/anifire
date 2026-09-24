package com.example.animebackend.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/** A title saved to the viewer's list. Unique per (user, anime). */
@Entity
@Table(
        name = "bookmarks",
        indexes = {
            @Index(name = "ux_bookmark_slot", columnList = "userId,animeId", unique = true),
            @Index(name = "ix_bookmarks_user_recent", columnList = "userId,createdAt")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Bookmark {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long animeId;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
