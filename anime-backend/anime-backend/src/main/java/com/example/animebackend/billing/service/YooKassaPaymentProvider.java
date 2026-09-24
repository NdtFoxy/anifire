package com.example.animebackend.billing.service;

import com.example.animebackend.billing.config.BillingProperties;
import com.example.animebackend.billing.entity.PaymentIntent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * YooKassa (RF card/SBP acquiring), first provider because that is the audience.
 *
 * Two provider-specific details worth naming:
 *
 * - Every create call carries an {@code Idempotence-Key}. YooKassa deduplicates on
 *   it, so a retry after a timeout resumes the same payment instead of charging
 *   twice. The key is the intent id, which is why the intent is persisted first.
 * - Callbacks are not signed. The documented approach is to treat a notification
 *   as a hint and re-read the payment through the API, which is what
 *   {@link #fetchStatus} does.
 */
@Component
public class YooKassaPaymentProvider implements PaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(YooKassaPaymentProvider.class);
    private static final String API = "https://api.yookassa.ru/v3/payments";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper json = new ObjectMapper();
    private final BillingProperties props;

    public YooKassaPaymentProvider(BillingProperties props) {
        this.props = props;
    }

    @Override
    public String id() {
        return "yookassa";
    }

    @Override
    public Created create(PaymentIntent intent, String returnUrl) {
        Map<String, Object> body = Map.of(
                "amount", Map.of("value", rubles(intent.getAmountMinor()), "currency", intent.getCurrency()),
                "capture", true,
                "confirmation", Map.of("type", "redirect", "return_url", returnUrl),
                "description", "Anifire " + intent.getPlan() + " (user " + intent.getUserId() + ")",
                // Metadata is convenience for the dashboard only — the local intent
                // remains the single source of truth for who bought what.
                "metadata", Map.of("intentId", String.valueOf(intent.getId())));
        JsonNode created = call(HttpRequest.newBuilder(URI.create(API))
                .header("Idempotence-Key", "anifire-intent-" + intent.getId())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(write(body), StandardCharsets.UTF_8)));
        String paymentId = created.path("id").asText(null);
        String url = created.path("confirmation").path("confirmation_url").asText(null);
        if (paymentId == null || url == null) {
            throw new IllegalStateException("YooKassa returned no confirmation url");
        }
        return new Created(paymentId, url);
    }

    @Override
    public Status fetchStatus(String providerPaymentId) {
        JsonNode payment = call(HttpRequest.newBuilder(URI.create(API + "/" + providerPaymentId)).GET());
        State state = switch (payment.path("status").asText("")) {
            case "succeeded" -> State.SUCCEEDED;
            case "canceled" -> State.CANCELED;
            case "pending", "waiting_for_capture" -> State.PENDING;
            default -> State.UNKNOWN;
        };
        JsonNode amount = payment.path("amount");
        return new Status(state, minorUnits(amount.path("value").asText("0")), amount.path("currency").asText("RUB"));
    }

    private JsonNode call(HttpRequest.Builder builder) {
        if (props.shopId() == null || props.shopId().isBlank() || props.secretKey() == null || props.secretKey().isBlank()) {
            throw new IllegalStateException("YooKassa credentials are not configured (anifire.billing.shop-id / secret-key)");
        }
        String basic = Base64.getEncoder().encodeToString(
                (props.shopId() + ":" + props.secretKey()).getBytes(StandardCharsets.UTF_8));
        HttpRequest request = builder
                .header("Authorization", "Basic " + basic)
                .timeout(Duration.ofSeconds(15))
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() / 100 != 2) {
                // The body can contain the payer's description; log the code and the
                // provider's error type, never the whole payload.
                JsonNode error = json.readTree(response.body());
                log.warn("YooKassa {} -> {} {}", request.uri().getPath(), response.statusCode(), error.path("code").asText(""));
                throw new IllegalStateException("YooKassa rejected the request: " + response.statusCode());
            }
            return json.readTree(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("YooKassa call interrupted", e);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("YooKassa unreachable", e);
        }
    }

    private String write(Map<String, Object> body) {
        try {
            return json.writeValueAsString(body);
        } catch (Exception e) {
            throw new IllegalStateException("cannot serialise payment request", e);
        }
    }

    /** Kopecks to the "123.45" string the API expects. */
    private static String rubles(int minor) {
        return minor / 100 + "." + String.format("%02d", minor % 100);
    }

    private static int minorUnits(String value) {
        try {
            return new java.math.BigDecimal(value).movePointRight(2).intValueExact();
        } catch (Exception e) {
            return 0;
        }
    }
}
