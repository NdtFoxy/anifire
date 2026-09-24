package com.example.animebackend.ads.repository;

import com.example.animebackend.ads.entity.AdEvent;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdEventRepository extends JpaRepository<AdEvent, Long> {

    boolean existsByDecisionIdAndKind(String decisionId, AdEvent.Kind kind);

    /** Totals per kind for the reporting period. */
    @Query("""
            select e.kind, count(e)
            from AdEvent e
            where e.createdAt > :since
            group by e.kind
            """)
    List<Object[]> totalsSince(@Param("since") Instant since);

    /** Per-campaign totals per kind, for the admin table. */
    @Query("""
            select e.campaignId, e.kind, count(e)
            from AdEvent e
            where e.createdAt > :since
            group by e.campaignId, e.kind
            """)
    List<Object[]> perCampaignSince(@Param("since") Instant since);

    /** Daily impressions and clicks for the chart. */
    @Query(value = """
            select date_trunc('day', created_at) as day,
                   count(*) filter (where kind = 'START') as impressions,
                   count(*) filter (where kind = 'CLICK') as clicks
            from ad_events
            where created_at > :since
            group by 1
            order by 1
            """, nativeQuery = true)
    List<Object[]> dailySince(@Param("since") Instant since);
}
