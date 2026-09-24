package com.example.animebackend.ads.repository;

import com.example.animebackend.ads.entity.AdDecision;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdDecisionRepository extends JpaRepository<AdDecision, String> {

    /** Frequency capping counts decisions, not beacons: a client can drop beacons. */
    long countByCampaignIdAndCreatedAtAfter(Long campaignId, Instant since);

    long countByUserIdAndCreatedAtAfter(Long userId, Instant since);
}
