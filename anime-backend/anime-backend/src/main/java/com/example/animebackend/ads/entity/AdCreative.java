package com.example.animebackend.ads.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/** The file that airs, plus the rules for airing it. */
@Entity
@Table(name = "ad_creatives")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AdCreative {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long campaignId;

    @Column(nullable = false, length = 600)
    private String src;

    @Column(nullable = false)
    private int durationSec;

    /** {@code null} means unskippable. */
    private Integer skipAfterSec;

    @Column(length = 600)
    private String clickUrl;

    /**
     * ЕРИР/ОРД marking token. Absent means the creative is not registered with the
     * ad register, and {@code AdDecisionService} refuses to serve it — airing an
     * unmarked ad is the operator's fine, not the advertiser's.
     */
    @Column(length = 120)
    private String ordToken;

    @Column(length = 400)
    private String legalDisclaimer;

    private Integer ageRating;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant updatedAt;

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
