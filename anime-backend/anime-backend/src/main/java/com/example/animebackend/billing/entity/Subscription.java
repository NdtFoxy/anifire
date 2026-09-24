package com.example.animebackend.billing.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * A user's paid entitlement. At most one row per user may be live (PENDING or
 * ACTIVE) — enforced by the partial unique index {@code ux_subscriptions_user_live}.
 * {@code currentPeriodEnd} is {@code null} for {@link SubscriptionPlan#LIFETIME},
 * which is what "remove ads for good" resolves to.
 */
@Entity
@Table(name = "subscriptions", indexes = @Index(name = "ix_subscriptions_user", columnList = "userId"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SubscriptionPlan plan;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SubscriptionStatus status;

    /** End of the paid period; {@code null} means the entitlement never expires. */
    private Instant currentPeriodEnd;

    @Builder.Default
    @Column(nullable = false)
    private boolean cancelAtPeriodEnd = false;

    /** Payment provider that owns this subscription (e.g. {@code yookassa}, {@code manual}). */
    @Column(nullable = false, length = 32)
    private String provider;

    /** Provider-side identifier, used to match webhook callbacks back to this row. */
    @Column(length = 128)
    private String providerSubscriptionId;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant updatedAt;

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
