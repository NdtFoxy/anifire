package com.example.animebackend.notification.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/** One inbox entry. Unique per (user, kind, title, episode). */
@Entity
@Table(name = "notifications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    public enum Kind {
        NEW_EPISODE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Kind kind;

    @Column(nullable = false)
    private Long animeId;

    @Column(nullable = false)
    private String animeTitle;

    @Column(nullable = false)
    private int episode;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant readAt;
}
