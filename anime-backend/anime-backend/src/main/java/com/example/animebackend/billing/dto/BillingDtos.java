package com.example.animebackend.billing.dto;

import com.example.animebackend.billing.entity.SubscriptionPlan;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Wire shapes for checkout and subscription state. */
public final class BillingDtos {

    private BillingDtos() {}

    public record PlanView(
            SubscriptionPlan plan,
            String title,
            int priceRub,
            String periodLabel,
            List<String> perks) {}

    public record CheckoutRequest(
            @NotNull SubscriptionPlan plan,
            /** Where the provider sends the payer back; validated against our own origin. */
            @Size(max = 300) String returnUrl) {}

    public record CheckoutResponse(String paymentId, String confirmationUrl) {}

    public record SubscriptionView(
            String status,
            SubscriptionPlan plan,
            Instant currentPeriodEnd,
            boolean cancelAtPeriodEnd,
            boolean adsFree) {}
}
