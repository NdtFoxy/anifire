package com.example.animebackend.ads.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * What an advertiser bought.
 *
 * The legal identity lives here rather than in a document somewhere: RF
 * advertising law makes every impression reportable, and a campaign whose
 * advertiser cannot be named is a campaign that must not air.
 */
@Entity
@Table(name = "ad_campaigns")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AdCampaign {

    public enum Status {
        DRAFT,
        ACTIVE,
        PAUSED,
        ARCHIVED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(nullable = false, length = 200)
    private String advertiser;

    /** 10 digits for a company, 12 for a sole trader. */
    @Column(name = "advertiser_inn", nullable = false, length = 12)
    private String advertiserInn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private Status status = Status.DRAFT;

    private Instant startsAt;

    private Instant endsAt;

    /** 0 means uncapped; otherwise serving stops for the rest of the UTC day. */
    @Column(nullable = false)
    @Builder.Default
    private int dailyImpressionCap = 0;

    @Column(nullable = false)
    @Builder.Default
    private int priority = 50;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant updatedAt;

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
