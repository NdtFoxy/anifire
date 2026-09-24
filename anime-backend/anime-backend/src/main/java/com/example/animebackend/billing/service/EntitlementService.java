package com.example.animebackend.billing.service;

import com.example.animebackend.billing.entity.Subscription;
import com.example.animebackend.billing.repository.SubscriptionRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Single source of truth for "is this user ads-free right now?". */
@Service
public class EntitlementService {

    private final SubscriptionRepository subscriptions;

    public EntitlementService(SubscriptionRepository subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Transactional(readOnly = true)
    public Entitlement forUser(Long userId) {
        if (userId == null) {
            return Entitlement.NONE;
        }
        return subscriptions.findEntitling(userId, Instant.now())
                .map(s -> new Entitlement(true, s.getPlan(), s.getCurrentPeriodEnd()))
                .orElse(Entitlement.NONE);
    }

    /**
     * Batch resolver for listings. Users without an entitling subscription are absent
     * from the map — callers substitute {@link Entitlement#NONE}.
     */
    @Transactional(readOnly = true)
    public Map<Long, Entitlement> forUsers(Collection<Long> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return subscriptions.findEntitlingForUsers(userIds, Instant.now()).stream()
                .collect(Collectors.toMap(
                        Subscription::getUserId,
                        s -> new Entitlement(true, s.getPlan(), s.getCurrentPeriodEnd()),
                        (first, second) -> second));
    }
}
