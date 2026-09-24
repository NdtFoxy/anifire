package com.example.animebackend.billing.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * A provider callback, stored verbatim and exactly once.
 *
 * Append-only on purpose: this table is the audit trail a payment dispute is
 * argued from, and the unique index on (provider, providerEventId) is what makes
 * a retried delivery a no-op instead of a second subscription.
 */
@Entity
@Table(name = "payment_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentEvent {

    public enum Outcome {
        /** Changed state: a subscription was granted, extended or ended. */
        APPLIED,
        /** Seen before — the unique index rejected the insert. */
        DUPLICATE,
        /** Valid but uninteresting (a pending notification, an unknown event type). */
        IGNORED,
        /** Could not be trusted: no matching intent, or the provider disowned it. */
        REJECTED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String provider;

    @Column(nullable = false, length = 200)
    private String providerEventId;

    @Column(nullable = false, length = 48)
    private String kind;

    private Long intentId;

    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Outcome outcome;

    @Column(length = 400)
    private String note;

    /**
     * The provider's body, verbatim. Postgres `text` rather than a JPA `@Lob`:
     * `@Lob` on a String maps to `oid` (a large-object handle in a side table),
     * which schema validation rejects against a `text` column and which would put
     * the audit trail somewhere `SELECT payload` cannot reach.
     */
    @Column(nullable = false, columnDefinition = "text")
    private String payload;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant receivedAt = Instant.now();
}
