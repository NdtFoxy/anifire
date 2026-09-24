package com.example.animebackend.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Daily AI budget per account (prefix {@code anifire.ai}).
 *
 * These are cost controls, not product limits: every unit is GPU time or a paid
 * API call, and the endpoints they guard were reachable without a token until
 * now — the kind of hole a scanner turns into someone else's compute bill.
 */
@ConfigurationProperties(prefix = "anifire.ai")
public record AiQuotaProperties(int reviewPerDay, int translatePerDay) {
}
