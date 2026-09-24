package com.example.animebackend.billing.entity;

/**
 * Lifecycle of a subscription row. Only {@link #ACTIVE} grants entitlements;
 * {@link #PENDING} exists between checkout creation and the provider callback.
 */
public enum SubscriptionStatus {
    PENDING,
    ACTIVE,
    CANCELED,
    EXPIRED
}
