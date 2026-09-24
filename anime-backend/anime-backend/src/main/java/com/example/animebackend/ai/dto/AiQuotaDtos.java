package com.example.animebackend.ai.dto;

import com.example.animebackend.ai.entity.AiUsage;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.Map;

/** Wire shapes for the AI budget. */
public final class AiQuotaDtos {

    private AiQuotaDtos() {}

    public record ConsumeRequest(
            @NotNull AiUsage.Kind kind,
            /** Work units: one review, or one subtitle line. */
            @Min(1) @Max(200) int units) {}

    public record ConsumeResponse(boolean allowed, int used, int limit, Instant resetAt) {}

    public record QuotaStatus(int used, int limit, Instant resetAt, Map<String, Integer> kinds) {}
}
