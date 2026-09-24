package com.example.animebackend.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.animebackend.billing.entity.Subscription;
import com.example.animebackend.billing.entity.SubscriptionPlan;
import com.example.animebackend.billing.entity.SubscriptionStatus;
import com.example.animebackend.billing.repository.SubscriptionRepository;
import com.example.animebackend.billing.service.Entitlement;
import com.example.animebackend.billing.service.EntitlementService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Contract of "who is ads-free": only ACTIVE and still within the paid period. */
@SpringBootTest
@ActiveProfiles("test")
class EntitlementServiceTest {

    private static final long USER = 4242L;
    private static final long OTHER_USER = 4243L;

    @Autowired
    private EntitlementService entitlements;

    @Autowired
    private SubscriptionRepository subscriptions;

    @BeforeEach
    void clean() {
        subscriptions.deleteAll();
    }

    @Test
    void noSubscriptionMeansAds() {
        assertThat(entitlements.forUser(USER)).isEqualTo(Entitlement.NONE);
    }

    @Test
    void anonymousViewerIsNeverAdsFree() {
        assertThat(entitlements.forUser(null).adsFree()).isFalse();
    }

    @Test
    void lifetimeGrantsAdsFreeWithoutExpiry() {
        save(SubscriptionPlan.LIFETIME, SubscriptionStatus.ACTIVE, null);

        Entitlement result = entitlements.forUser(USER);

        assertThat(result.adsFree()).isTrue();
        assertThat(result.plan()).isEqualTo(SubscriptionPlan.LIFETIME);
        assertThat(result.premiumUntil()).isNull();
    }

    @Test
    void activePeriodInTheFutureGrantsAdsFree() {
        Instant end = Instant.now().plus(30, ChronoUnit.DAYS);
        save(SubscriptionPlan.MONTHLY, SubscriptionStatus.ACTIVE, end);

        Entitlement result = entitlements.forUser(USER);

        assertThat(result.adsFree()).isTrue();
        assertThat(result.premiumUntil()).isCloseTo(end, within());
    }

    @Test
    void lapsedPeriodRevokesAdsFree() {
        save(SubscriptionPlan.MONTHLY, SubscriptionStatus.ACTIVE, Instant.now().minusSeconds(1));

        assertThat(entitlements.forUser(USER).adsFree()).isFalse();
    }

    @Test
    void nonActiveStatusDoesNotGrantAdsFree() {
        save(SubscriptionPlan.MONTHLY, SubscriptionStatus.PENDING, Instant.now().plusSeconds(3600));

        assertThat(entitlements.forUser(USER).adsFree()).isFalse();
    }

    @Test
    void batchLookupOnlyReturnsEntitledUsers() {
        save(SubscriptionPlan.LIFETIME, SubscriptionStatus.ACTIVE, null);
        subscriptions.save(Subscription.builder()
                .userId(OTHER_USER)
                .plan(SubscriptionPlan.MONTHLY)
                .status(SubscriptionStatus.CANCELED)
                .currentPeriodEnd(Instant.now().minusSeconds(1))
                .provider("manual")
                .build());

        Map<Long, Entitlement> byUser = entitlements.forUsers(List.of(USER, OTHER_USER));

        assertThat(byUser).containsOnlyKeys(USER);
        assertThat(byUser.get(USER).adsFree()).isTrue();
        assertThat(entitlements.forUsers(List.of())).isEmpty();
    }

    private void save(SubscriptionPlan plan, SubscriptionStatus status, Instant periodEnd) {
        subscriptions.save(Subscription.builder()
                .userId(USER)
                .plan(plan)
                .status(status)
                .currentPeriodEnd(periodEnd)
                .provider("manual")
                .build());
    }

    private static org.assertj.core.data.TemporalUnitOffset within() {
        return org.assertj.core.api.Assertions.within(1, ChronoUnit.SECONDS);
    }
}
