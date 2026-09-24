package com.example.animebackend.billing.service;

import com.example.animebackend.billing.entity.PaymentIntent;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Local provider for development: no acquirer, no keys, no money.
 *
 * It exists so the whole flow — intent, redirect, callback, entitlement, token
 * refresh — can be exercised end to end before the real credentials are issued,
 * which is the only way to know the wiring is right. The confirmation URL points
 * at our own callback endpoint, so following it behaves like a payer completing
 * checkout.
 *
 * It is selected only when {@code anifire.billing.provider=dev}; the startup
 * safety check refuses that value outside development.
 */
@Component
public class DevPaymentProvider implements PaymentProvider {

    private final Map<String, Status> payments = new ConcurrentHashMap<>();

    @Override
    public String id() {
        return "dev";
    }

    @Override
    public Created create(PaymentIntent intent, String returnUrl) {
        String paymentId = "dev-" + intent.getId();
        // A dev payment is born already paid: the redirect below is what delivers
        // the callback, and there is nobody to enter a card number.
        payments.put(paymentId, new Status(State.SUCCEEDED, intent.getAmountMinor(), intent.getCurrency()));
        // Absolute, and against *this* backend: a relative URL gets resolved by the
        // browser against the frontend origin, which 404s — measured, not guessed.
        // Real providers hand back an absolute URL, so the dev loop must too.
        String base = selfUrl();
        String callback = base + "/api/v1/billing/webhook/dev?paymentId=" + paymentId
                + "&next=" + java.net.URLEncoder.encode(returnUrl, java.nio.charset.StandardCharsets.UTF_8);
        return new Created(paymentId, callback);
    }

    @Override
    public Status fetchStatus(String providerPaymentId) {
        return payments.getOrDefault(providerPaymentId, new Status(State.UNKNOWN, 0, "RUB"));
    }

    /**
     * The origin the caller reached us on, so the redirect lands on the same host
     * the browser is already using. Falls back to the configured port because the
     * service is also driven from tests, where no request is bound to the thread.
     */
    private static String selfUrl() {
        try {
            return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        } catch (IllegalStateException noRequest) {
            return "http://localhost:8080";
        }
    }
}
