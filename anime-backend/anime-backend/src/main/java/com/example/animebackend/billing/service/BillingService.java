package com.example.animebackend.billing.service;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.billing.config.BillingProperties;
import com.example.animebackend.billing.dto.BillingDtos;
import com.example.animebackend.billing.entity.PaymentEvent;
import com.example.animebackend.billing.entity.PaymentIntent;
import com.example.animebackend.billing.entity.Subscription;
import com.example.animebackend.billing.entity.SubscriptionPlan;
import com.example.animebackend.billing.entity.SubscriptionStatus;
import com.example.animebackend.billing.repository.PaymentEventRepository;
import com.example.animebackend.billing.repository.PaymentIntentRepository;
import com.example.animebackend.billing.repository.SubscriptionRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Selling and revoking the ads-free entitlement.
 *
 * The shape of this service is dictated by one fact: the callback that says "paid"
 * arrives as unauthenticated HTTP from the internet, possibly several times, and
 * possibly for a payment nobody here started. So the flow is:
 *
 * 1. {@link #checkout} writes a local intent while the buyer is still authenticated
 *    — who, which plan, how much, in kopecks from configuration.
 * 2. The provider is asked to create a payment (idempotently, keyed by intent id).
 * 3. {@link #handleCallback} treats the callback purely as a hint: it reads the
 *    payment id, re-reads the authoritative status from the provider, and matches
 *    it against the intent. A body claiming success proves nothing on its own.
 * 4. Every callback is journalled exactly once; the unique index on
 *    (provider, providerEventId) is what makes a retry a no-op instead of a second
 *    subscription.
 *
 * Amount is verified too: if the provider reports a different figure than the
 * intent recorded, the event is rejected rather than granted, because that means
 * either a tampered checkout or a provider-side mismatch — neither is a sale.
 */
@Service
public class BillingService {

    private static final Logger log = LoggerFactory.getLogger(BillingService.class);

    private final SubscriptionRepository subscriptions;
    private final PaymentIntentRepository intents;
    private final PaymentEventRepository events;
    private final EntitlementService entitlements;
    private final BillingProperties props;
    private final Map<String, PaymentProvider> providers;

    public BillingService(
            SubscriptionRepository subscriptions,
            PaymentIntentRepository intents,
            PaymentEventRepository events,
            EntitlementService entitlements,
            BillingProperties props,
            List<PaymentProvider> availableProviders) {
        this.subscriptions = subscriptions;
        this.intents = intents;
        this.events = events;
        this.entitlements = entitlements;
        this.props = props;
        this.providers = availableProviders.stream()
                .collect(java.util.stream.Collectors.toMap(PaymentProvider::id, p -> p));
    }

    /* ─────────────────────────── catalogue ─────────────────────────── */

    public List<BillingDtos.PlanView> plans() {
        return List.of(
                new BillingDtos.PlanView(
                        SubscriptionPlan.MONTHLY,
                        "Месяц",
                        props.monthlyPriceMinor() / 100,
                        "в месяц",
                        List.of("Без рекламы", "Весь каталог", "Отмена в любой момент")),
                new BillingDtos.PlanView(
                        SubscriptionPlan.YEARLY,
                        "Год",
                        props.yearlyPriceMinor() / 100,
                        "в год",
                        List.of("Без рекламы", "На два месяца дешевле помесячной", "Отмена в любой момент")),
                new BillingDtos.PlanView(
                        SubscriptionPlan.LIFETIME,
                        "Навсегда",
                        props.lifetimePriceMinor() / 100,
                        "один раз",
                        List.of("Без рекламы навсегда", "Один платёж, без продлений", "Остаётся с вашим аккаунтом")));
    }

    /* ─────────────────────────── checkout ─────────────────────────── */

    @Transactional
    public BillingDtos.CheckoutResponse checkout(Long userId, SubscriptionPlan plan, String requestedReturnUrl) {
        if (entitlements.forUser(userId).adsFree()) {
            throw ApiException.badRequest("already_subscribed", "У этого аккаунта уже нет рекламы.");
        }
        subscriptions.findLive(userId).ifPresent(live -> {
            // The partial unique index would reject a second live row anyway; failing
            // here turns a 500 into an answer the UI can show.
            if (live.getStatus() == SubscriptionStatus.PENDING) {
                throw ApiException.badRequest("payment_pending", "Платёж по этому аккаунту ещё обрабатывается.");
            }
        });

        PaymentProvider provider = provider();
        PaymentIntent intent = intents.save(PaymentIntent.builder()
                .userId(userId)
                .plan(plan)
                .provider(provider.id())
                .amountMinor(priceOf(plan))
                .currency(props.currency())
                .status(PaymentIntent.Status.CREATED)
                .build());

        PaymentProvider.Created created;
        try {
            created = provider.create(intent, returnUrl(requestedReturnUrl));
        } catch (RuntimeException e) {
            intent.setStatus(PaymentIntent.Status.FAILED);
            log.warn("Checkout failed for user {} plan {}: {}", userId, plan, e.toString());
            throw ApiException.badRequest("payment_unavailable", "Оплата временно недоступна. Попробуйте чуть позже.");
        }

        intent.setProviderPaymentId(created.providerPaymentId());
        intent.setStatus(PaymentIntent.Status.PENDING);
        return new BillingDtos.CheckoutResponse(created.providerPaymentId(), created.confirmationUrl());
    }

    /* ─────────────────────────── callback ─────────────────────────── */

    /**
     * Applies a provider callback.
     *
     * Runs in its own transaction and never rethrows a provider problem to the
     * caller as an error status: an acquirer that receives a 500 retries for hours,
     * and every one of those retries would hit the same broken row. The journal
     * records what happened instead.
     *
     * @param eventId provider-side identifier for this delivery; falls back to the
     *                payment id so a provider without event ids still deduplicates
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PaymentEvent.Outcome handleCallback(String providerId, String eventId, String paymentId, String kind, String rawBody) {
        PaymentProvider provider = providers.get(providerId);
        if (provider == null) {
            return journal(providerId, eventId, kind, null, null, PaymentEvent.Outcome.REJECTED, "unknown provider", rawBody);
        }
        if (paymentId == null || paymentId.isBlank()) {
            return journal(providerId, eventId, kind, null, null, PaymentEvent.Outcome.REJECTED, "no payment id", rawBody);
        }
        if (events.existsByProviderAndProviderEventId(providerId, eventId)) {
            return PaymentEvent.Outcome.DUPLICATE;
        }

        Optional<PaymentIntent> found = intents.findByProviderAndProviderPaymentId(providerId, paymentId);
        if (found.isEmpty()) {
            // Either a payment created outside this system or an attempt to make one
            // up. Both are the same answer: no intent, no entitlement.
            return journal(providerId, eventId, kind, null, null, PaymentEvent.Outcome.REJECTED, "no matching intent", rawBody);
        }
        PaymentIntent intent = found.get();

        PaymentProvider.Status status;
        try {
            status = provider.fetchStatus(paymentId);
        } catch (RuntimeException e) {
            log.warn("Provider {} would not confirm payment {}: {}", providerId, paymentId, e.toString());
            return journal(providerId, eventId, kind, intent, PaymentEvent.Outcome.IGNORED,
                    "provider unreachable — will be retried", rawBody);
        }

        if (status.state() == PaymentProvider.State.SUCCEEDED && status.amountMinor() != intent.getAmountMinor()) {
            intent.setStatus(PaymentIntent.Status.FAILED);
            log.error("Amount mismatch on payment {}: intent {} kopecks, provider {}",
                    paymentId, intent.getAmountMinor(), status.amountMinor());
            return journal(providerId, eventId, kind, intent, PaymentEvent.Outcome.REJECTED, "amount mismatch", rawBody);
        }

        // Event ids deduplicate a *delivery*; this deduplicates the *payment*. A
        // provider that reports the same succeeded payment under two notification
        // ids would otherwise extend the subscription twice — measured, not
        // hypothetical: a second callback with a fresh event id added another 30
        // days. One intent is one sale, whatever the callback stream looks like.
        if (status.state() == PaymentProvider.State.SUCCEEDED
                && intent.getStatus() == PaymentIntent.Status.SUCCEEDED) {
            return journal(providerId, eventId, kind, intent, PaymentEvent.Outcome.DUPLICATE,
                    "intent already granted", rawBody);
        }

        return switch (status.state()) {
            case SUCCEEDED -> {
                intent.setStatus(PaymentIntent.Status.SUCCEEDED);
                grant(intent);
                yield journal(providerId, eventId, kind, intent, PaymentEvent.Outcome.APPLIED, "entitlement granted", rawBody);
            }
            case CANCELED -> {
                intent.setStatus(PaymentIntent.Status.CANCELED);
                yield journal(providerId, eventId, kind, intent, PaymentEvent.Outcome.APPLIED, "payment canceled", rawBody);
            }
            case PENDING, UNKNOWN ->
                journal(providerId, eventId, kind, intent, PaymentEvent.Outcome.IGNORED, "not final yet", rawBody);
        };
    }

    /** Grants or extends the entitlement for a paid intent. */
    private void grant(PaymentIntent intent) {
        Instant now = Instant.now();
        Subscription live = subscriptions.findLive(intent.getUserId()).orElse(null);
        Instant periodEnd = switch (intent.getPlan()) {
            // Extending from the existing end, not from now: a renewal paid a day
            // early must not cost the buyer that day.
            case MONTHLY -> base(live, now).plus(30, ChronoUnit.DAYS);
            case YEARLY -> base(live, now).plus(365, ChronoUnit.DAYS);
            case LIFETIME -> null;
        };

        if (live == null) {
            subscriptions.save(Subscription.builder()
                    .userId(intent.getUserId())
                    .plan(intent.getPlan())
                    .status(SubscriptionStatus.ACTIVE)
                    .currentPeriodEnd(periodEnd)
                    .provider(intent.getProvider())
                    .providerSubscriptionId(intent.getProviderPaymentId())
                    .build());
            return;
        }
        live.setPlan(intent.getPlan());
        live.setStatus(SubscriptionStatus.ACTIVE);
        live.setCurrentPeriodEnd(periodEnd);
        live.setCancelAtPeriodEnd(false);
        live.setProvider(intent.getProvider());
        live.setProviderSubscriptionId(intent.getProviderPaymentId());
    }

    private static Instant base(Subscription live, Instant now) {
        if (live == null || live.getCurrentPeriodEnd() == null) return now;
        return live.getCurrentPeriodEnd().isAfter(now) ? live.getCurrentPeriodEnd() : now;
    }

    /* ─────────────────────────── state / cancel ─────────────────────────── */

    @Transactional(readOnly = true)
    public BillingDtos.SubscriptionView subscription(Long userId) {
        Subscription live = subscriptions.findLive(userId).orElse(null);
        boolean adsFree = entitlements.forUser(userId).adsFree();
        if (live == null) {
            return new BillingDtos.SubscriptionView("NONE", null, null, false, adsFree);
        }
        return new BillingDtos.SubscriptionView(
                live.getStatus().name(),
                live.getPlan(),
                live.getCurrentPeriodEnd(),
                live.isCancelAtPeriodEnd(),
                adsFree);
    }

    /**
     * Stops the renewal without taking away what was paid for.
     *
     * A cancel that revoked access immediately would be a refund the buyer did not
     * ask for; the entitlement therefore stands until {@code currentPeriodEnd}, and
     * a lifetime purchase cannot be cancelled at all because there is nothing to
     * stop renewing.
     */
    @Transactional
    public void cancel(Long userId) {
        Subscription live = subscriptions.findLive(userId)
                .orElseThrow(() -> ApiException.badRequest("no_subscription", "Нет подписки для отмены."));
        if (live.getPlan() == SubscriptionPlan.LIFETIME) {
            throw ApiException.badRequest("lifetime_not_cancelable", "Пожизненную подписку нечего отменять.");
        }
        live.setCancelAtPeriodEnd(true);
        if (live.getCurrentPeriodEnd() == null || !live.getCurrentPeriodEnd().isAfter(Instant.now())) {
            // Nothing left to serve: end it now instead of leaving a live row that
            // grants nothing and blocks the next purchase.
            live.setStatus(SubscriptionStatus.CANCELED);
        }
    }

    /* ─────────────────────────── helpers ─────────────────────────── */

    private PaymentProvider provider() {
        PaymentProvider provider = providers.get(props.provider());
        if (provider == null) {
            throw new IllegalStateException("Configured payment provider '" + props.provider() + "' is not available");
        }
        return provider;
    }

    private int priceOf(SubscriptionPlan plan) {
        return switch (plan) {
            case MONTHLY -> props.monthlyPriceMinor();
            case YEARLY -> props.yearlyPriceMinor();
            case LIFETIME -> props.lifetimePriceMinor();
        };
    }

    /**
     * Only our own frontend may be a return target. An open redirect here would let
     * a payment link land the buyer on a copy of the site right after they paid.
     */
    private String returnUrl(String requested) {
        String fallback = props.returnUrl();
        if (requested == null || requested.isBlank()) return fallback;
        try {
            java.net.URI candidate = java.net.URI.create(requested);
            java.net.URI allowed = java.net.URI.create(fallback);
            boolean sameOrigin = candidate.getHost() != null
                    && candidate.getHost().equalsIgnoreCase(allowed.getHost())
                    && candidate.getPort() == allowed.getPort();
            return sameOrigin ? requested : fallback;
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    private PaymentEvent.Outcome journal(
            String provider, String eventId, String kind, PaymentIntent intent,
            PaymentEvent.Outcome outcome, String note, String rawBody) {
        return journal(provider, eventId, kind, intent, intent == null ? null : intent.getUserId(), outcome, note, rawBody);
    }

    private PaymentEvent.Outcome journal(
            String provider, String eventId, String kind, PaymentIntent intent, Long userId,
            PaymentEvent.Outcome outcome, String note, String rawBody) {
        try {
            events.save(PaymentEvent.builder()
                    .provider(provider)
                    .providerEventId(eventId)
                    .kind(kind == null ? "unknown" : kind)
                    .intentId(intent == null ? null : intent.getId())
                    .userId(userId)
                    .outcome(outcome)
                    .note(note)
                    .payload(rawBody == null ? "" : rawBody)
                    .build());
            return outcome;
        } catch (DataIntegrityViolationException duplicate) {
            // Two deliveries raced; the index decided which one counted.
            return PaymentEvent.Outcome.DUPLICATE;
        }
    }
}
