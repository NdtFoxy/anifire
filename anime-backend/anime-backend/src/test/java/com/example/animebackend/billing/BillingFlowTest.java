package com.example.animebackend.billing;

import com.example.animebackend.auth.web.ApiException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.billing.dto.BillingDtos;
import com.example.animebackend.billing.entity.PaymentEvent;
import com.example.animebackend.billing.entity.PaymentIntent;
import com.example.animebackend.billing.entity.SubscriptionPlan;
import com.example.animebackend.billing.entity.SubscriptionStatus;
import com.example.animebackend.billing.repository.PaymentEventRepository;
import com.example.animebackend.billing.repository.PaymentIntentRepository;
import com.example.animebackend.billing.repository.SubscriptionRepository;
import com.example.animebackend.billing.service.BillingService;
import com.example.animebackend.billing.service.EntitlementService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * The money path, exercised through the service with the dev provider.
 *
 * These are the cases where a mistake costs real money or gives away the product,
 * so each one is a rule someone will eventually be tempted to relax:
 * a retried callback must not sell twice, a callback without an intent must not
 * grant anything, a price that disagrees with the provider is not a sale, and a
 * cancellation must not take away a period that was already paid for.
 */
@SpringBootTest
@ActiveProfiles("test")
class BillingFlowTest {

    @Autowired
    private BillingService billing;

    @Autowired
    private EntitlementService entitlements;

    @Autowired
    private SubscriptionRepository subscriptions;

    @Autowired
    private PaymentIntentRepository intents;

    @Autowired
    private PaymentEventRepository events;

    @Autowired
    private AppUserRepository users;

    private Long userId;

    @BeforeEach
    void seed() {
        events.deleteAll();
        intents.deleteAll();
        subscriptions.deleteAll();
        AppUser user = users.save(AppUser.builder()
                .email("buyer-" + System.nanoTime() + "@example.com")
                .passwordHash("x")
                .displayName("Buyer")
                .role(Role.USER)
                .emailVerified(true)
                .build());
        userId = user.getId();
    }

    /** The happy path: checkout, callback, entitlement. */
    @Test
    void paidCheckoutGrantsAdsFree() {
        BillingDtos.CheckoutResponse checkout =
                billing.checkout(userId, SubscriptionPlan.MONTHLY, "http://localhost:3000/profile");
        assertThat(checkout.confirmationUrl()).contains("/billing/webhook/dev");
        assertThat(entitlements.forUser(userId).adsFree()).isFalse();

        PaymentEvent.Outcome outcome =
                billing.handleCallback("dev", "evt-1", checkout.paymentId(), "payment.succeeded", "{}");

        assertThat(outcome).isEqualTo(PaymentEvent.Outcome.APPLIED);
        assertThat(entitlements.forUser(userId).adsFree()).isTrue();
        assertThat(billing.subscription(userId).status()).isEqualTo("ACTIVE");
        assertThat(intents.findAll().getFirst().getStatus()).isEqualTo(PaymentIntent.Status.SUCCEEDED);
    }

    /** Acquirers retry for hours; the second delivery must change nothing. */
    @Test
    void repeatedCallbackDoesNotSellTwice() {
        BillingDtos.CheckoutResponse checkout =
                billing.checkout(userId, SubscriptionPlan.MONTHLY, null);
        billing.handleCallback("dev", "evt-1", checkout.paymentId(), "payment.succeeded", "{}");
        Instant firstEnd = subscriptions.findLive(userId).orElseThrow().getCurrentPeriodEnd();

        PaymentEvent.Outcome again =
                billing.handleCallback("dev", "evt-1", checkout.paymentId(), "payment.succeeded", "{}");

        assertThat(again).isEqualTo(PaymentEvent.Outcome.DUPLICATE);
        assertThat(subscriptions.findAll()).hasSize(1);
        assertThat(subscriptions.findLive(userId).orElseThrow().getCurrentPeriodEnd()).isEqualTo(firstEnd);
    }


    /**
     * Idempotency must survive a provider that invents a new notification id for the
     * same payment: found in a live HTTP run, where the second delivery silently
     * added another 30 days.
     */
    @Test
    void samePaymentUnderTwoEventIdsGrantsOnce() {
        BillingDtos.CheckoutResponse checkout = billing.checkout(userId, SubscriptionPlan.MONTHLY, null);
        billing.handleCallback("dev", "evt-a", checkout.paymentId(), "payment.succeeded", "{}");
        Instant firstEnd = subscriptions.findLive(userId).orElseThrow().getCurrentPeriodEnd();

        PaymentEvent.Outcome second =
                billing.handleCallback("dev", "evt-b", checkout.paymentId(), "payment.succeeded", "{}");

        assertThat(second).isEqualTo(PaymentEvent.Outcome.DUPLICATE);
        assertThat(subscriptions.findLive(userId).orElseThrow().getCurrentPeriodEnd()).isEqualTo(firstEnd);
    }
    /** A payment nobody started here grants nothing, however convincing the body. */
    @Test
    void callbackWithoutIntentIsRejected() {
        PaymentEvent.Outcome outcome = billing.handleCallback(
                "dev", "evt-forged", "dev-999999", "payment.succeeded",
                "{\"object\":{\"status\":\"succeeded\",\"amount\":{\"value\":\"1.00\"}}}");

        assertThat(outcome).isEqualTo(PaymentEvent.Outcome.REJECTED);
        assertThat(entitlements.forUser(userId).adsFree()).isFalse();
        assertThat(subscriptions.findAll()).isEmpty();
        assertThat(events.findTop50ByOrderByReceivedAtDesc().getFirst().getNote()).contains("no matching intent");
    }

    /** An unknown provider cannot be talked into confirming anything. */
    @Test
    void callbackFromUnknownProviderIsRejected() {
        assertThat(billing.handleCallback("stripe", "evt-x", "pi_123", "payment.succeeded", "{}"))
                .isEqualTo(PaymentEvent.Outcome.REJECTED);
    }

    /** Cancelling stops the renewal and keeps the paid period. */
    @Test
    void cancelKeepsThePaidPeriod() {
        BillingDtos.CheckoutResponse checkout = billing.checkout(userId, SubscriptionPlan.MONTHLY, null);
        billing.handleCallback("dev", "evt-1", checkout.paymentId(), "payment.succeeded", "{}");

        billing.cancel(userId);

        BillingDtos.SubscriptionView view = billing.subscription(userId);
        assertThat(view.cancelAtPeriodEnd()).isTrue();
        assertThat(view.status()).isEqualTo("ACTIVE");
        assertThat(view.adsFree()).isTrue();
        assertThat(view.currentPeriodEnd()).isAfter(Instant.now().plus(20, ChronoUnit.DAYS));
    }

    /** Lifetime has no renewal to stop, so cancelling it is a client mistake. */
    @Test
    void lifetimeCannotBeCancelled() {
        BillingDtos.CheckoutResponse checkout = billing.checkout(userId, SubscriptionPlan.LIFETIME, null);
        billing.handleCallback("dev", "evt-1", checkout.paymentId(), "payment.succeeded", "{}");

        assertThat(subscriptions.findLive(userId).orElseThrow().getCurrentPeriodEnd()).isNull();
        assertThatThrownBy(() -> billing.cancel(userId)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getCode()).isEqualTo("lifetime_not_cancelable"));
        assertThat(entitlements.forUser(userId).adsFree()).isTrue();
    }

    /** A renewal paid early extends from the old end, not from today. */
    @Test
    void renewalExtendsFromTheExistingEnd() {
        // Both payments are created through the provider, because a callback is only
        // honoured for a payment the provider itself will confirm. Two intents can
        // legitimately exist at once: nothing is granted until the first one lands.
        BillingDtos.CheckoutResponse first = billing.checkout(userId, SubscriptionPlan.MONTHLY, null);
        BillingDtos.CheckoutResponse second = billing.checkout(userId, SubscriptionPlan.MONTHLY, null);

        billing.handleCallback("dev", "evt-1", first.paymentId(), "payment.succeeded", "{}");
        Instant firstEnd = subscriptions.findLive(userId).orElseThrow().getCurrentPeriodEnd();

        billing.handleCallback("dev", "evt-2", second.paymentId(), "payment.succeeded", "{}");

        Instant secondEnd = subscriptions.findLive(userId).orElseThrow().getCurrentPeriodEnd();
        assertThat(secondEnd).isAfter(firstEnd.plus(29, ChronoUnit.DAYS));
        assertThat(subscriptions.findAll()).hasSize(1);
    }

    /** Buying while already ads-free is refused rather than silently double-charged. */
    @Test
    void secondPurchaseWhileEntitledIsRefused() {
        BillingDtos.CheckoutResponse checkout = billing.checkout(userId, SubscriptionPlan.MONTHLY, null);
        billing.handleCallback("dev", "evt-1", checkout.paymentId(), "payment.succeeded", "{}");

        assertThatThrownBy(() -> billing.checkout(userId, SubscriptionPlan.YEARLY, null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo("already_subscribed"));
    }

    /** An off-origin return target is replaced, never followed. */
    @Test
    void foreignReturnUrlIsNotHonoured() {
        BillingDtos.CheckoutResponse checkout =
                billing.checkout(userId, SubscriptionPlan.MONTHLY, "https://evil.example.com/paid");

        PaymentIntent intent = intents.findAll().getFirst();
        assertThat(checkout.confirmationUrl()).doesNotContain("evil.example.com");
        assertThat(intent.getStatus()).isEqualTo(PaymentIntent.Status.PENDING);
    }

    /** An expired ACTIVE row is not an entitlement. */
    @Test
    void lapsedPeriodStopsBeingAdsFree() {
        BillingDtos.CheckoutResponse checkout = billing.checkout(userId, SubscriptionPlan.MONTHLY, null);
        billing.handleCallback("dev", "evt-1", checkout.paymentId(), "payment.succeeded", "{}");

        var live = subscriptions.findLive(userId).orElseThrow();
        live.setCurrentPeriodEnd(Instant.now().minus(1, ChronoUnit.DAYS));
        subscriptions.save(live);

        assertThat(entitlements.forUser(userId).adsFree()).isFalse();
        assertThat(subscriptions.findLive(userId).orElseThrow().getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);
    }
}
