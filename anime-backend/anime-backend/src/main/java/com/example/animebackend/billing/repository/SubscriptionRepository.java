package com.example.animebackend.billing.repository;

import com.example.animebackend.billing.entity.Subscription;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    /**
     * The subscription that currently grants entitlements: ACTIVE and either
     * lifetime (no period end) or still inside its paid period.
     */
    @Query("""
            select s from Subscription s
            where s.userId = :userId
              and s.status = com.example.animebackend.billing.entity.SubscriptionStatus.ACTIVE
              and (s.currentPeriodEnd is null or s.currentPeriodEnd > :now)
            order by s.id desc
            limit 1
            """)
    Optional<Subscription> findEntitling(@Param("userId") Long userId, @Param("now") Instant now);

    /** Batch variant of {@link #findEntitling} — avoids N+1 on admin user listings. */
    @Query("""
            select s from Subscription s
            where s.userId in :userIds
              and s.status = com.example.animebackend.billing.entity.SubscriptionStatus.ACTIVE
              and (s.currentPeriodEnd is null or s.currentPeriodEnd > :now)
            order by s.id asc
            """)
    List<Subscription> findEntitlingForUsers(
            @Param("userIds") Collection<Long> userIds, @Param("now") Instant now);

    /**
     * The one row that may exist per user while a purchase is in flight or paid —
     * enforced by the partial unique index {@code ux_subscriptions_user_live}. This
     * is the row a callback updates; entitlement questions use {@link #findEntitling}
     * instead, because an ACTIVE row whose period has passed grants nothing.
     */
    @Query("""
            select s from Subscription s
            where s.userId = :userId
              and s.status in (
                    com.example.animebackend.billing.entity.SubscriptionStatus.PENDING,
                    com.example.animebackend.billing.entity.SubscriptionStatus.ACTIVE)
            order by s.id desc
            limit 1
            """)
    Optional<Subscription> findLive(@Param("userId") Long userId);
}
