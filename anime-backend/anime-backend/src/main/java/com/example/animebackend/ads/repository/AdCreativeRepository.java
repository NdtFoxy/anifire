package com.example.animebackend.ads.repository;

import com.example.animebackend.ads.entity.AdCreative;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdCreativeRepository extends JpaRepository<AdCreative, Long> {

    List<AdCreative> findByCampaignIdOrderByIdAsc(Long campaignId);

    /**
     * Airable creatives of a campaign: active, and marked for the ad register. The
     * ORD condition is here rather than in the caller so no future code path can
     * forget it.
     */
    @org.springframework.data.jpa.repository.Query("""
            select c from AdCreative c
            where c.campaignId = :campaignId
              and c.active = true
              and c.ordToken is not null
              and c.ordToken <> ''
            order by c.id asc
            """)
    List<AdCreative> findAirable(@org.springframework.data.repository.query.Param("campaignId") Long campaignId);

    long countByCampaignId(Long campaignId);
}
