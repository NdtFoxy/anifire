package com.example.animebackend.ads;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.animebackend.ads.dto.AdDtos;
import com.example.animebackend.ads.entity.AdCampaign;
import com.example.animebackend.ads.entity.AdCreative;
import com.example.animebackend.ads.entity.AdEvent;
import com.example.animebackend.ads.repository.AdCampaignRepository;
import com.example.animebackend.ads.repository.AdCreativeRepository;
import com.example.animebackend.ads.repository.AdDecisionRepository;
import com.example.animebackend.ads.repository.AdEventRepository;
import com.example.animebackend.ads.service.AdDecisionService;
import com.example.animebackend.ads.service.AdEventService;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.billing.entity.Subscription;
import com.example.animebackend.billing.entity.SubscriptionPlan;
import com.example.animebackend.billing.entity.SubscriptionStatus;
import com.example.animebackend.billing.repository.SubscriptionRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * What airs, and to whom.
 *
 * Every case here is a way to lose money or break the law: serving ads to a paying
 * viewer, serving the product free to everyone else, airing a creative that is not
 * registered with the ad register, blowing past a campaign's daily cap, or counting
 * one impression twice because a beacon was retried.
 */
@SpringBootTest
@ActiveProfiles("test")
class AdDecisionTest {

    @Autowired
    private AdDecisionService decisions;

    @Autowired
    private AdEventService events;

    @Autowired
    private AdCampaignRepository campaigns;

    @Autowired
    private AdCreativeRepository creatives;

    @Autowired
    private AdDecisionRepository decisionRows;

    @Autowired
    private AdEventRepository eventRows;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private SubscriptionRepository subscriptions;

    private Long campaignId;

    @BeforeEach
    void seed() {
        eventRows.deleteAll();
        decisionRows.deleteAll();
        creatives.deleteAll();
        campaigns.deleteAll();
        subscriptions.deleteAll();

        campaignId = campaigns.save(AdCampaign.builder()
                        .name("Bookmaker Q3")
                        .advertiser("ООО Пример")
                        .advertiserInn("7712345678")
                        .status(AdCampaign.Status.ACTIVE)
                        .priority(50)
                        .dailyImpressionCap(0)
                        .build())
                .getId();

        creatives.save(AdCreative.builder()
                .campaignId(campaignId)
                .src("https://cdn.example.com/preroll.mp4")
                .durationSec(20)
                .skipAfterSec(5)
                .clickUrl("https://example.com/promo")
                .ordToken("ORD-123")
                .legalDisclaimer("Реклама. ООО «Пример». 18+")
                .ageRating(18)
                .active(true)
                .build());
    }

    private Long newUser() {
        return users.save(AppUser.builder()
                        .email("viewer-" + System.nanoTime() + "@example.com")
                        .passwordHash("x")
                        .displayName("Viewer")
                        .role(Role.USER)
                        .emailVerified(true)
                        .build())
                .getId();
    }

    @Test
    void anonymousViewerGetsAPrerollWithTheMandatoryLabel() {
        AdDtos.AdPlan plan = decisions.planFor(null, "1", 1, "RU");

        assertThat(plan).isNotNull();
        AdDtos.AdSlot slot = plan.slots().getFirst();
        assertThat(slot.kind()).isEqualTo("PREROLL");
        assertThat(slot.label()).isEqualTo("Реклама");
        assertThat(slot.advertiser()).isEqualTo("ООО Пример");
        assertThat(slot.ageRating()).isEqualTo(18);
        assertThat(slot.skipAfterSec()).isEqualTo(5);
        assertThat(slot.decisionId()).isNotBlank();
        assertThat(decisionRows.count()).isEqualTo(1);
    }

    /** The entire product being sold. */
    @Test
    void subscriberGetsNothing() {
        Long userId = newUser();
        subscriptions.save(Subscription.builder()
                .userId(userId)
                .plan(SubscriptionPlan.MONTHLY)
                .status(SubscriptionStatus.ACTIVE)
                .currentPeriodEnd(Instant.now().plus(30, ChronoUnit.DAYS))
                .provider("dev")
                .build());

        assertThat(decisions.planFor(userId, "1", 1, "RU")).isNull();
        assertThat(decisionRows.count()).isZero();
    }

    /** A lapsed subscription is not a subscription. */
    @Test
    void expiredSubscriberSeesAdsAgain() {
        Long userId = newUser();
        subscriptions.save(Subscription.builder()
                .userId(userId)
                .plan(SubscriptionPlan.MONTHLY)
                .status(SubscriptionStatus.ACTIVE)
                .currentPeriodEnd(Instant.now().minus(1, ChronoUnit.DAYS))
                .provider("dev")
                .build());

        assertThat(decisions.planFor(userId, "1", 1, "RU")).isNotNull();
    }

    /** Airing an unregistered creative is the operator's fine, so it must not air. */
    @Test
    void creativeWithoutOrdTokenNeverAirs() {
        creatives.findAll().forEach(c -> {
            c.setOrdToken(null);
            creatives.save(c);
        });

        assertThat(decisions.planFor(null, "1", 1, "RU")).isNull();
        assertThat(decisionRows.count()).isZero();
    }

    @Test
    void pausedCampaignDoesNotServe() {
        AdCampaign campaign = campaigns.findById(campaignId).orElseThrow();
        campaign.setStatus(AdCampaign.Status.PAUSED);
        campaigns.save(campaign);

        assertThat(decisions.planFor(null, "1", 1, "RU")).isNull();
    }

    @Test
    void campaignOutsideItsFlightWindowDoesNotServe() {
        AdCampaign campaign = campaigns.findById(campaignId).orElseThrow();
        campaign.setStartsAt(Instant.now().plus(2, ChronoUnit.DAYS));
        campaign.setEndsAt(Instant.now().plus(9, ChronoUnit.DAYS));
        campaigns.save(campaign);

        assertThat(decisions.planFor(null, "1", 1, "RU")).isNull();
    }

    /** A cap is a promise to the advertiser and a limit on our own inventory. */
    @Test
    void dailyCapStopsServing() {
        AdCampaign campaign = campaigns.findById(campaignId).orElseThrow();
        campaign.setDailyImpressionCap(2);
        campaigns.save(campaign);

        assertThat(decisions.planFor(null, "1", 1, "RU")).isNotNull();
        assertThat(decisions.planFor(null, "1", 2, "RU")).isNotNull();
        assertThat(decisions.planFor(null, "1", 3, "RU")).isNull();
    }

    /** Higher priority wins, and the winner is deterministic. */
    @Test
    void higherPriorityCampaignWins() {
        Long premiumId = campaigns.save(AdCampaign.builder()
                        .name("Priority buy")
                        .advertiser("ООО Приоритет")
                        .advertiserInn("770123456789")
                        .status(AdCampaign.Status.ACTIVE)
                        .priority(90)
                        .build())
                .getId();
        creatives.save(AdCreative.builder()
                .campaignId(premiumId)
                .src("https://cdn.example.com/priority.mp4")
                .durationSec(15)
                .ordToken("ORD-999")
                .active(true)
                .build());

        AdDtos.AdPlan plan = decisions.planFor(null, "1", 1, "RU");

        assertThat(plan).isNotNull();
        assertThat(plan.slots().getFirst().advertiser()).isEqualTo("ООО Приоритет");
    }

    /** sendBeacon fires on tab close and can arrive twice; billing must not double. */
    @Test
    void repeatedBeaconIsCountedOnce() {
        AdDtos.AdPlan plan = decisions.planFor(null, "1", 1, "RU");
        String decisionId = plan.slots().getFirst().decisionId();

        assertThat(events.record(new AdDtos.EventRequest(decisionId, AdEvent.Kind.START, 0))).isTrue();
        assertThat(events.record(new AdDtos.EventRequest(decisionId, AdEvent.Kind.START, 0))).isFalse();
        assertThat(eventRows.count()).isEqualTo(1);
    }

    /** An invented decision id buys nothing, and says nothing about what exists. */
    @Test
    void beaconForUnknownDecisionIsDropped() {
        assertThat(events.record(new AdDtos.EventRequest("00000000-0000-0000-0000-000000000000",
                AdEvent.Kind.CLICK, 3))).isFalse();
        assertThat(eventRows.count()).isZero();
    }

    /** Quartiles and the click are separate rows on the same decision. */
    @Test
    void distinctKindsAllLand() {
        AdDtos.AdPlan plan = decisions.planFor(null, "1", 1, "RU");
        String id = plan.slots().getFirst().decisionId();

        for (AdEvent.Kind kind : AdEvent.Kind.values()) {
            assertThat(events.record(new AdDtos.EventRequest(id, kind, 1))).isTrue();
        }

        assertThat(eventRows.count()).isEqualTo(AdEvent.Kind.values().length);
    }
}
