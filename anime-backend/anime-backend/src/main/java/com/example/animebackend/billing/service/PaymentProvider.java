package com.example.animebackend.billing.service;

import com.example.animebackend.billing.entity.PaymentIntent;

/**
 * A payment provider, reduced to the three things billing actually needs.
 *
 * The interface exists so the first provider is not the architecture: adding
 * Stripe later must be a new class, not a rewrite of the subscription logic.
 *
 * {@link #fetchStatus} is the important one. Callbacks are unauthenticated HTTP
 * from the internet, so nothing they claim is used: they only reveal *which*
 * payment to ask about, and the answer comes from the provider's own API over
 * TLS with our credentials. That removes callback forgery from the threat model
 * entirely rather than defending against it with a shared secret.
 */
public interface PaymentProvider {

    /** Stable id stored on rows and used in the callback URL path. */
    String id();

    /** Creates the payment and returns where to send the payer. */
    Created create(PaymentIntent intent, String returnUrl);

    /** Authoritative state, read from the provider. */
    Status fetchStatus(String providerPaymentId);

    record Created(String providerPaymentId, String confirmationUrl) {}

    /**
     * @param amountMinor as reported by the provider, so an intent whose price was
     *                    tampered with client-side can be rejected
     */
    record Status(State state, int amountMinor, String currency) {}

    enum State {
        PENDING,
        SUCCEEDED,
        CANCELED,
        UNKNOWN
    }
}
