package com.example.animebackend.billing.web;

import com.example.animebackend.auth.security.RateLimiterService;
import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.billing.dto.BillingDtos;
import com.example.animebackend.billing.entity.PaymentEvent;
import com.example.animebackend.billing.service.BillingService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * Checkout, provider callbacks, cancellation.
 *
 * The callback endpoint is the only unauthenticated write in the application, so
 * it is deliberately dull: parse two strings out of the body, hand them to the
 * service, and answer 200 whatever happens. Acquirers retry anything that is not a
 * 2xx for hours, and a retry storm caused by our own bug is worse than a callback
 * we recorded and ignored — the journal in {@code payment_events} is where the
 * truth about each delivery lives.
 */
@RestController
@RequestMapping("/api/v1/billing")
public class BillingController {

    private static final Logger log = LoggerFactory.getLogger(BillingController.class);

    private final BillingService billing;
    private final RateLimiterService rateLimiter;
    private final ObjectMapper json = new ObjectMapper();

    public BillingController(BillingService billing, RateLimiterService rateLimiter) {
        this.billing = billing;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/plans")
    public List<BillingDtos.PlanView> plans() {
        return billing.plans();
    }

    @PostMapping("/checkout")
    public BillingDtos.CheckoutResponse checkout(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BillingDtos.CheckoutRequest body) {
        Long userId = userId(jwt);
        // Creating payments is cheap for us and expensive for the provider; a loop
        // here would also fill the dashboard with abandoned payments.
        if (!rateLimiter.allow("checkout:user:" + userId, 10, Duration.ofHours(1))) {
            throw ApiException.tooManyRequests("Слишком много попыток оплаты. Попробуйте позже.");
        }
        return billing.checkout(userId, body.plan(), body.returnUrl());
    }

    @GetMapping("/subscription")
    public BillingDtos.SubscriptionView mySubscription(@AuthenticationPrincipal Jwt jwt) {
        return billing.subscription(userId(jwt));
    }

    @PostMapping("/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@AuthenticationPrincipal Jwt jwt) {
        billing.cancel(userId(jwt));
    }

    /**
     * Provider callback.
     *
     * Nothing in {@code body} is trusted: it supplies an event id (for idempotency)
     * and a payment id (to look up), and the service re-reads the payment from the
     * provider before granting anything.
     */
    @PostMapping("/webhook/{provider}")
    public ResponseEntity<Map<String, String>> webhook(
            @PathVariable String provider,
            @RequestBody(required = false) String rawBody,
            HttpServletRequest request) {
        PaymentEvent.Outcome outcome = apply(provider, rawBody, request.getParameter("paymentId"), null);
        return ResponseEntity.ok(Map.of("outcome", outcome.name().toLowerCase()));
    }

    /**
     * Development loop: the dev provider's confirmation URL is a GET to this
     * endpoint, so following the "payment page" link behaves like a payer finishing
     * checkout and then being redirected back to the app.
     */
    @GetMapping("/webhook/{provider}")
    public ResponseEntity<Void> devReturn(
            @PathVariable String provider,
            @RequestParam String paymentId,
            @RequestParam(required = false) String next) {
        apply(provider, "{\"source\":\"dev-redirect\"}", paymentId, "dev.redirect");
        String target = next == null || next.isBlank() ? "/" : next;
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(target)).build();
    }

    private PaymentEvent.Outcome apply(String provider, String rawBody, String paymentIdParam, String kindOverride) {
        String eventId = null;
        String paymentId = paymentIdParam;
        String kind = kindOverride;
        if (rawBody != null && !rawBody.isBlank()) {
            try {
                JsonNode node = json.readTree(rawBody);
                // YooKassa shape: {"type":"notification","event":"payment.succeeded","object":{"id":...}}
                JsonNode object = node.path("object");
                if (paymentId == null || paymentId.isBlank()) {
                    paymentId = object.path("id").asText(null);
                }
                if (kind == null) {
                    kind = node.path("event").asText(null);
                }
                eventId = node.path("id").asText(null);
            } catch (Exception e) {
                log.warn("Unparseable callback body from {}", provider);
            }
        }
        if (eventId == null || eventId.isBlank()) {
            // Providers that do not identify a delivery still must not be able to
            // grant twice: the payment id plus the event type is stable per state
            // change, so a retry of the same notification collides on the index.
            eventId = paymentId + ":" + (kind == null ? "unknown" : kind);
        }
        try {
            return billing.handleCallback(provider, eventId, paymentId, kind, rawBody);
        } catch (RuntimeException e) {
            // Never let a bug here become an acquirer retry loop.
            log.error("Callback processing failed for {} payment {}", provider, paymentId, e);
            return PaymentEvent.Outcome.IGNORED;
        }
    }

    private static Long userId(Jwt jwt) {
        if (jwt == null) throw ApiException.unauthorized("unauthorized", "Вы не вошли в аккаунт.");
        return Long.valueOf(jwt.getSubject());
    }
}
