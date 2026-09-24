package com.example.animebackend.billing.service;

import com.example.animebackend.billing.entity.SubscriptionPlan;
import java.time.Instant;

/**
 * What a user is entitled to right now. Resolved server-side and mirrored into the
 * access token and {@code /api/v1/auth/me}; the client copy is for UI only — every
 * ad decision must re-check this on the server.
 *
 * @param adsFree      true when pre-roll and other ad slots must be suppressed
 * @param plan         the plan granting it, or {@code null} when none
 * @param premiumUntil end of the paid period, or {@code null} for lifetime / no plan
 */
public record Entitlement(boolean adsFree, SubscriptionPlan plan, Instant premiumUntil) {

    public static final Entitlement NONE = new Entitlement(false, null, null);
}
