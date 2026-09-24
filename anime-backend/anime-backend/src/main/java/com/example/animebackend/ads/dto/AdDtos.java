package com.example.animebackend.ads.dto;

import com.example.animebackend.ads.entity.AdCampaign;
import com.example.animebackend.ads.entity.AdEvent;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Wire shapes for serving, reporting and administering ads. */
public final class AdDtos {

    private AdDtos() {}

    /* ─────────── serving (public) ─────────── */

    /**
     * @param decisionId the only ad token the browser ever sees; a client cannot
     *                   invent an impression for a campaign it was not given
     * @param label      always «Реклама» — mandatory disclosure, not a choice
     */
    public record AdSlot(
            String decisionId,
            String kind,
            String src,
            int durationSec,
            Integer skipAfterSec,
            String clickUrl,
            String advertiser,
            String label,
            String disclaimer,
            Integer ageRating) {}

    public record AdPlan(List<AdSlot> slots) {}

    public record EventRequest(
            @NotBlank @Size(max = 36) String decisionId,
            @NotNull AdEvent.Kind event,
            @Min(0) @Max(36_000) int positionSec) {}

    /* ─────────── admin ─────────── */

    public record CampaignView(
            Long id,
            String name,
            String advertiser,
            String advertiserInn,
            AdCampaign.Status status,
            Instant startsAt,
            Instant endsAt,
            int dailyImpressionCap,
            int priority,
            Instant createdAt,
            long creativeCount) {}

    public record CampaignRequest(
            @NotBlank @Size(max = 160) String name,
            @NotBlank @Size(max = 200) String advertiser,
            @Pattern(regexp = "^[0-9]{10}([0-9]{2})?$", message = "ИНН — 10 или 12 цифр")
            String advertiserInn,
            @NotNull AdCampaign.Status status,
            Instant startsAt,
            Instant endsAt,
            @Min(0) int dailyImpressionCap,
            @Min(0) @Max(100) int priority) {}

    public record CreativeView(
            Long id,
            Long campaignId,
            String src,
            int durationSec,
            Integer skipAfterSec,
            String clickUrl,
            String ordToken,
            String legalDisclaimer,
            Integer ageRating,
            boolean active,
            Instant createdAt) {}

    public record CreativeRequest(
            @NotBlank @Size(max = 600) String src,
            @Min(1) @Max(600) int durationSec,
            @Min(0) @Max(600) Integer skipAfterSec,
            @Size(max = 600) String clickUrl,
            @Size(max = 120) String ordToken,
            @Size(max = 400) String legalDisclaimer,
            @Min(0) @Max(21) Integer ageRating,
            boolean active) {}

    public record CampaignStats(
            Long campaignId,
            String name,
            long impressions,
            long completes,
            long skips,
            long clicks) {}

    public record DailyStat(String date, long impressions, long clicks) {}

    public record StatsView(
            long impressions,
            long completes,
            long skips,
            long clicks,
            double ctr,
            double completionRate,
            List<CampaignStats> byCampaign,
            List<DailyStat> daily,
            /** Inventory that cannot air, so the operator sees why fill is low. */
            Map<String, Long> blocked) {}
}
