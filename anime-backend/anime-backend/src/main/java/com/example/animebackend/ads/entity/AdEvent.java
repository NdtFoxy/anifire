package com.example.animebackend.ads.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/** A playback beacon. Append-only, one row per (decision, kind). */
@Entity
@Table(name = "ad_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AdEvent {

    public enum Kind {
        START,
        Q25,
        Q50,
        Q75,
        COMPLETE,
        SKIP,
        CLICK
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 36)
    private String decisionId;

    @Column(nullable = false)
    private Long campaignId;

    @Column(nullable = false)
    private Long creativeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Kind kind;

    @Column(nullable = false)
    @Builder.Default
    private int positionSec = 0;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
