package com.example.animebackend.ads.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * "This viewer was told to play this creative."
 *
 * Written before the ad airs, so a beacon arriving seconds later has something to
 * be matched against — and so the event log itself never has to carry identity.
 * The id is a UUID handed to the client: it is the only ad token the browser sees,
 * which means a client cannot invent an impression for a campaign it was not given.
 */
@Entity
@Table(name = "ad_decisions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AdDecision {

    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false)
    private Long creativeId;

    @Column(nullable = false)
    private Long campaignId;

    /** Null for anonymous viewers, who are exactly the ones ads are for. */
    private Long userId;

    @Column(length = 120)
    private String animeKey;

    private Integer episode;

    @Column(length = 2)
    private String country;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
