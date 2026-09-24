package com.example.animebackend.ads.service;

import com.example.animebackend.ads.dto.AdDtos;
import com.example.animebackend.ads.entity.AdCampaign;
import com.example.animebackend.ads.entity.AdCreative;
import com.example.animebackend.ads.entity.AdEvent;
import com.example.animebackend.ads.repository.AdCampaignRepository;
import com.example.animebackend.ads.repository.AdCreativeRepository;
import com.example.animebackend.ads.repository.AdEventRepository;
import com.example.animebackend.auth.web.ApiException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Campaign and creative management, plus the numbers the console shows. */
@Service
public class AdAdminService {

    private final AdCampaignRepository campaigns;
    private final AdCreativeRepository creatives;
    private final AdEventRepository events;

    public AdAdminService(
            AdCampaignRepository campaigns, AdCreativeRepository creatives, AdEventRepository events) {
        this.campaigns = campaigns;
        this.creatives = creatives;
        this.events = events;
    }

    /* ─────────── campaigns ─────────── */

    @Transactional(readOnly = true)
    public List<AdDtos.CampaignView> listCampaigns() {
        return campaigns.findAllByOrderByCreatedAtDesc().stream().map(this::view).toList();
    }

    @Transactional
    public AdDtos.CampaignView createCampaign(AdDtos.CampaignRequest request) {
        validate(request);
        AdCampaign saved = campaigns.save(AdCampaign.builder()
                .name(request.name().trim())
                .advertiser(request.advertiser().trim())
                .advertiserInn(request.advertiserInn())
                .status(request.status())
                .startsAt(request.startsAt())
                .endsAt(request.endsAt())
                .dailyImpressionCap(request.dailyImpressionCap())
                .priority(request.priority())
                .build());
        return view(saved);
    }

    @Transactional
    public AdDtos.CampaignView updateCampaign(Long id, AdDtos.CampaignRequest request) {
        validate(request);
        AdCampaign campaign = campaigns.findById(id)
                .orElseThrow(() -> ApiException.badRequest("campaign_not_found", "No such campaign."));
        campaign.setName(request.name().trim());
        campaign.setAdvertiser(request.advertiser().trim());
        campaign.setAdvertiserInn(request.advertiserInn());
        campaign.setStatus(request.status());
        campaign.setStartsAt(request.startsAt());
        campaign.setEndsAt(request.endsAt());
        campaign.setDailyImpressionCap(request.dailyImpressionCap());
        campaign.setPriority(request.priority());
        return view(campaign);
    }

    /**
     * Archiving, not deleting: impressions already reported to the ad register must
     * keep the campaign they belong to, and a deleted row would take its creatives
     * (and their ORD tokens) with it.
     */
    @Transactional
    public void archiveCampaign(Long id) {
        AdCampaign campaign = campaigns.findById(id)
                .orElseThrow(() -> ApiException.badRequest("campaign_not_found", "No such campaign."));
        campaign.setStatus(AdCampaign.Status.ARCHIVED);
    }

    /* ─────────── creatives ─────────── */

    @Transactional(readOnly = true)
    public List<AdDtos.CreativeView> listCreatives(Long campaignId) {
        return creatives.findByCampaignIdOrderByIdAsc(campaignId).stream().map(this::view).toList();
    }

    @Transactional
    public AdDtos.CreativeView createCreative(Long campaignId, AdDtos.CreativeRequest request) {
        campaigns.findById(campaignId)
                .orElseThrow(() -> ApiException.badRequest("campaign_not_found", "No such campaign."));
        validate(request);
        return view(creatives.save(AdCreative.builder()
                .campaignId(campaignId)
                .src(request.src().trim())
                .durationSec(request.durationSec())
                .skipAfterSec(request.skipAfterSec())
                .clickUrl(blankToNull(request.clickUrl()))
                .ordToken(blankToNull(request.ordToken()))
                .legalDisclaimer(blankToNull(request.legalDisclaimer()))
                .ageRating(request.ageRating())
                .active(request.active())
                .build()));
    }

    @Transactional
    public AdDtos.CreativeView updateCreative(Long id, AdDtos.CreativeRequest request) {
        AdCreative creative = creatives.findById(id)
                .orElseThrow(() -> ApiException.badRequest("creative_not_found", "No such creative."));
        validate(request);
        creative.setSrc(request.src().trim());
        creative.setDurationSec(request.durationSec());
        creative.setSkipAfterSec(request.skipAfterSec());
        creative.setClickUrl(blankToNull(request.clickUrl()));
        creative.setOrdToken(blankToNull(request.ordToken()));
        creative.setLegalDisclaimer(blankToNull(request.legalDisclaimer()));
        creative.setAgeRating(request.ageRating());
        creative.setActive(request.active());
        return view(creative);
    }

    @Transactional
    public void deleteCreative(Long id) {
        creatives.deleteById(id);
    }

    /* ─────────── stats ─────────── */

    @Transactional(readOnly = true)
    public AdDtos.StatsView stats(String period) {
        Instant since = Instant.now().minus(window(period));

        Map<AdEvent.Kind, Long> totals = new HashMap<>();
        for (Object[] row : events.totalsSince(since)) {
            totals.put((AdEvent.Kind) row[0], ((Number) row[1]).longValue());
        }
        long impressions = totals.getOrDefault(AdEvent.Kind.START, 0L);
        long completes = totals.getOrDefault(AdEvent.Kind.COMPLETE, 0L);
        long skips = totals.getOrDefault(AdEvent.Kind.SKIP, 0L);
        long clicks = totals.getOrDefault(AdEvent.Kind.CLICK, 0L);

        Map<Long, long[]> perCampaign = new LinkedHashMap<>();
        for (Object[] row : events.perCampaignSince(since)) {
            long campaignId = ((Number) row[0]).longValue();
            AdEvent.Kind kind = (AdEvent.Kind) row[1];
            long count = ((Number) row[2]).longValue();
            long[] slot = perCampaign.computeIfAbsent(campaignId, k -> new long[4]);
            switch (kind) {
                case START -> slot[0] = count;
                case COMPLETE -> slot[1] = count;
                case SKIP -> slot[2] = count;
                case CLICK -> slot[3] = count;
                default -> { /* quartiles are not shown per campaign */ }
            }
        }
        Map<Long, String> names = new HashMap<>();
        for (AdCampaign campaign : campaigns.findAll()) names.put(campaign.getId(), campaign.getName());
        List<AdDtos.CampaignStats> byCampaign = new ArrayList<>();
        perCampaign.forEach((campaignId, slot) -> byCampaign.add(new AdDtos.CampaignStats(
                campaignId, names.getOrDefault(campaignId, "#" + campaignId), slot[0], slot[1], slot[2], slot[3])));

        List<AdDtos.DailyStat> daily = new ArrayList<>();
        for (Object[] row : events.dailySince(since)) {
            Instant day = row[0] instanceof Instant instant
                    ? instant
                    : ((java.sql.Timestamp) row[0]).toInstant();
            daily.add(new AdDtos.DailyStat(
                    day.toString().substring(0, 10),
                    ((Number) row[1]).longValue(),
                    ((Number) row[2]).longValue()));
        }

        // Why fill can be low even with active campaigns: inventory that cannot air.
        long unmarked = creatives.findAll().stream()
                .filter(c -> c.isActive() && (c.getOrdToken() == null || c.getOrdToken().isBlank()))
                .count();
        long inactive = creatives.findAll().stream().filter(c -> !c.isActive()).count();

        return new AdDtos.StatsView(
                impressions,
                completes,
                skips,
                clicks,
                impressions == 0 ? 0 : round((double) clicks * 100 / impressions),
                impressions == 0 ? 0 : round((double) completes * 100 / impressions),
                byCampaign,
                daily,
                Map.of("creativesWithoutOrdToken", unmarked, "inactiveCreatives", inactive));
    }

    /* ─────────── helpers ─────────── */

    private static Duration window(String period) {
        return switch (period == null ? "7d" : period) {
            case "24h" -> Duration.ofHours(24);
            case "30d" -> Duration.ofDays(30);
            case "7d" -> Duration.ofDays(7);
            default -> throw ApiException.badRequest("bad_period", "Period must be 24h, 7d or 30d.");
        };
    }

    private static double round(double value) {
        return Math.round(value * 100) / 100.0;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static void validate(AdDtos.CampaignRequest request) {
        if (request.startsAt() != null && request.endsAt() != null
                && !request.endsAt().isAfter(request.startsAt())) {
            throw ApiException.badRequest("bad_flight_window", "The end of the flight must be after its start.");
        }
    }

    private static void validate(AdDtos.CreativeRequest request) {
        if (request.skipAfterSec() != null && request.skipAfterSec() > request.durationSec()) {
            throw ApiException.badRequest(
                    "bad_skip_offset", "A skip offset past the creative's duration would never let anyone skip.");
        }
        requireHttpUrl(request.src(), "src");
        if (request.clickUrl() != null && !request.clickUrl().isBlank()) {
            requireHttpUrl(request.clickUrl(), "clickUrl");
        }
    }

    /**
     * Both URLs end up in the browser — one as a video source, one as a navigation
     * target — so a javascript: or data: URL here would be a stored XSS with an
     * advertiser's name on it.
     */
    private static void requireHttpUrl(String value, String field) {
        String lower = value.trim().toLowerCase(java.util.Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            throw ApiException.badRequest("bad_url", field + " must be an absolute http(s) URL.");
        }
    }

    private AdDtos.CampaignView view(AdCampaign campaign) {
        return new AdDtos.CampaignView(
                campaign.getId(),
                campaign.getName(),
                campaign.getAdvertiser(),
                campaign.getAdvertiserInn(),
                campaign.getStatus(),
                campaign.getStartsAt(),
                campaign.getEndsAt(),
                campaign.getDailyImpressionCap(),
                campaign.getPriority(),
                campaign.getCreatedAt(),
                creatives.countByCampaignId(campaign.getId()));
    }

    private AdDtos.CreativeView view(AdCreative creative) {
        return new AdDtos.CreativeView(
                creative.getId(),
                creative.getCampaignId(),
                creative.getSrc(),
                creative.getDurationSec(),
                creative.getSkipAfterSec(),
                creative.getClickUrl(),
                creative.getOrdToken(),
                creative.getLegalDisclaimer(),
                creative.getAgeRating(),
                creative.isActive(),
                creative.getCreatedAt());
    }
}
