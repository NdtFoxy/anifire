package com.example.animebackend.billing.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Billing settings (prefix {@code anifire.billing}).
 *
 * Prices live here rather than in code or in the frontend: a price change must be
 * a deploy-time value, and the client must never be able to state what something
 * costs. All amounts are kopecks — a price is never a floating point number.
 *
 * @param provider  which {@code PaymentProvider} to use: {@code yookassa} in
 *                  production, {@code dev} for a local loop with no acquirer
 * @param returnUrl fallback return target when the client does not supply one
 */
@ConfigurationProperties(prefix = "anifire.billing")
public record BillingProperties(
        String provider,
        String shopId,
        String secretKey,
        String returnUrl,
        int monthlyPriceMinor,
        int yearlyPriceMinor,
        int lifetimePriceMinor,
        String currency) {
}
