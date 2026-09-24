package com.example.animebackend.ads.service;

import com.example.animebackend.ads.dto.AdDtos;
import com.example.animebackend.ads.entity.AdCampaign;
import com.example.animebackend.ads.entity.AdCreative;
import com.example.animebackend.ads.entity.AdDecision;
import com.example.animebackend.ads.repository.AdCampaignRepository;
import com.example.animebackend.ads.repository.AdCreativeRepository;
import com.example.animebackend.ads.repository.AdDecisionRepository;
import com.example.animebackend.billing.service.EntitlementService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decides whether this viewer sees an ad, and which one.
 *
 * The decision is server-side and only server-side. The JWT carries an
 * {@code adsFree} claim, but that claim is a UI hint with a 15-minute TTL: a client
 * that lies about it, or simply holds a token minted before a subscription lapsed,
 * must not thereby earn free playback. So entitlement is re-read from the database
 * on every request — one indexed query against a table that is small by
 * construction (at most one live row per user).
 *
 * Three rules decide what airs, in this order:
 *
 * 1. Entitled viewers get nothing. No slots, no decision row, no beacons.
 * 2. A creative must be registered with the ad register (ORD token) to air at all.
 *    An unmarked ad is the operator's fine, so the repository query refuses it
 *    rather than trusting every future caller to remember.
 * 3. Frequency capping is counted on decisions, not beacons: a client can drop a
 *    beacon, and a campaign that has spent its daily cap must stop regardless.
 */
@Service
public class AdDecisionService {

    private static final Logger log = LoggerFactory.getLogger(AdDecisionService.class);

    /** Always «Реклама» — the label is mandatory, so it is not a per-campaign field. */
    private static final String AD_LABEL = "Реклама";

    private final AdCampaignRepository campaigns;
    private final AdCreativeRepository creatives;
    private final AdDecisionRepository decisions;
    private final EntitlementService entitlements;

    public AdDecisionService(
            AdCampaignRepository campaigns,
            AdCreativeRepository creatives,
            AdDecisionRepository decisions,
            EntitlementService entitlements) {
        this.campaigns = campaigns;
        this.creatives = creatives;
        this.decisions = decisions;
        this.entitlements = entitlements;
    }

    /**
     * The pre-roll plan for one playback.
     *
     * @param userId  null for an anonymous viewer — the audience ads exist for
     * @param country ISO-2 as resolved by the geo filter, for reporting
     * @return a plan with at most one slot, or {@code null} when nothing should air
     */
    @Transactional
    public AdDtos.AdPlan planFor(Long userId, String animeKey, Integer episode, String country) {
        if (userId != null && entitlements.forUser(userId).adsFree()) {
            // The whole point of the subscription. Not a slot, not an empty overlay.
            return null;
        }

        Instant now = Instant.now();
        Instant dayStart = now.truncatedTo(ChronoUnit.DAYS);

        for (AdCampaign campaign : campaigns.findServable(now)) {
            if (campaign.getDailyImpressionCap() > 0) {
                long served = decisions.countByCampaignIdAndCreatedAtAfter(campaign.getId(), dayStart);
                if (served >= campaign.getDailyImpressionCap()) continue;
            }
            List<AdCreative> airable = creatives.findAirable(campaign.getId());
            if (airable.isEmpty()) continue;

            // Rotate within the campaign so one creative does not carry every
            // impression; the decision count is a cheap, monotonic rotor.
            long rotor = decisions.countByCampaignIdAndCreatedAtAfter(campaign.getId(), dayStart);
            AdCreative creative = airable.get((int) (rotor % airable.size()));

            AdDecision decision = decisions.save(AdDecision.builder()
                    .id(UUID.randomUUID().toString())
                    .campaignId(campaign.getId())
                    .creativeId(creative.getId())
                    .userId(userId)
                    .animeKey(animeKey)
                    .episode(episode)
                    .country(country)
                    .createdAt(now)
                    .build());

            return new AdDtos.AdPlan(List.of(new AdDtos.AdSlot(
                    decision.getId(),
                    "PREROLL",
                    creative.getSrc(),
                    creative.getDurationSec(),
                    creative.getSkipAfterSec(),
                    creative.getClickUrl(),
                    campaign.getAdvertiser(),
                    AD_LABEL,
                    creative.getLegalDisclaimer(),
                    creative.getAgeRating())));
        }

        // No inventory is normal, not an error: playback proceeds ad-free.
        log.debug("No servable ad for user {} on {} ep {}", userId, animeKey, episode);
        return null;
    }
}
