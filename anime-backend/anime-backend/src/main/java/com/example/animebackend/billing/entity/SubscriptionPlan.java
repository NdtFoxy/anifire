package com.example.animebackend.billing.entity;

/** Purchasable ads-free plans. {@link #LIFETIME} never expires. */
public enum SubscriptionPlan {
    MONTHLY,
    YEARLY,
    LIFETIME
}
