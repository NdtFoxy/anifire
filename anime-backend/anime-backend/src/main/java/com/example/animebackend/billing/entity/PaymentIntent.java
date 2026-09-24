package com.example.animebackend.billing.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * What a user asked to buy, recorded before they leave for the payment page.
 *
 * The intent exists so that a callback never has to be believed about identity or
 * price: it arrives with a provider payment id, and everything that matters — who
 * is paying, for which plan, how much — is read from the row that was written on
 * our side while the user was still authenticated.
 */
@Entity
@Table(name = "payment_intents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentIntent {

    public enum Status {
        /** Created locally; the provider has not been called yet. */
        CREATED,
        /** The provider accepted it and is waiting for the payer. */
        PENDING,
        SUCCEEDED,
        CANCELED,
        FAILED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SubscriptionPlan plan;

    @Column(nullable = false, length = 32)
    private String provider;

    @Column(length = 160)
    private String providerPaymentId;

    /** Minor units (kopecks) so no rounding can ever enter a price. */
    @Column(nullable = false)
    private int amountMinor;

    @Column(nullable = false, length = 8)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private Status status = Status.CREATED;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant updatedAt;

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
