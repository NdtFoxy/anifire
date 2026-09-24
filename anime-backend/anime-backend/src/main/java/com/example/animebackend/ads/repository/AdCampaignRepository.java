package com.example.animebackend.ads.repository;

import com.example.animebackend.ads.entity.AdCampaign;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdCampaignRepository extends JpaRepository<AdCampaign, Long> {

    /**
     * Campaigns eligible to serve right now: ACTIVE and inside their flight window.
     * Highest priority first, so the decision is deterministic rather than "whatever
     * the database felt like returning".
     */
    @Query("""
            select c from AdCampaign c
            where c.status = com.example.animebackend.ads.entity.AdCampaign.Status.ACTIVE
              and (c.startsAt is null or c.startsAt <= :now)
              and (c.endsAt is null or c.endsAt > :now)
            order by c.priority desc, c.id asc
            """)
    List<AdCampaign> findServable(@Param("now") Instant now);

    List<AdCampaign> findAllByOrderByCreatedAtDesc();
}
