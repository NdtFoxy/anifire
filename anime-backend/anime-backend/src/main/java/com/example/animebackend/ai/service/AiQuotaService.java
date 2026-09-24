package com.example.animebackend.ai.service;

import com.example.animebackend.ai.config.AiQuotaProperties;
import com.example.animebackend.ai.dto.AiQuotaDtos;
import com.example.animebackend.ai.entity.AiUsage;
import com.example.animebackend.ai.repository.AiUsageRepository;
import com.example.animebackend.auth.web.ApiException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Metering for the AI features.
 *
 * The counter is written before the expensive work happens, inside a transaction
 * that locks the day's row: a request that is refused must leave the stored total
 * untouched, and two concurrent requests must not both see room for the last unit.
 *
 * The day boundary is UTC midnight. Not the user's timezone — a budget that resets
 * at a time the operator cannot predict is a budget nobody can reason about.
 */
@Service
public class AiQuotaService {

    private final AiUsageRepository usage;
    private final AiQuotaProperties props;

    public AiQuotaService(AiUsageRepository usage, AiQuotaProperties props) {
        this.usage = usage;
        this.props = props;
    }

    /**
     * Books {@code units} against today's budget.
     *
     * @throws ApiException 429 when the budget would be exceeded; nothing is stored
     */
    @Transactional
    public AiQuotaDtos.ConsumeResponse consume(Long userId, AiUsage.Kind kind, int units) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        int limit = limitFor(kind);

        AiUsage slot = usage.lockSlot(userId, today, kind).orElseGet(() -> AiUsage.builder()
                .userId(userId)
                .day(today)
                .kind(kind)
                .units(0)
                .build());

        int wanted = slot.getUnits() + units;
        if (wanted > limit) {
            // Return before any write: the whole point is that a refusal costs the
            // caller nothing and leaves the ledger honest.
            throw ApiException.tooManyRequests(
                    "Дневной лимит ИИ исчерпан (" + slot.getUnits() + "/" + limit + " " + kind.name().toLowerCase()
                            + "). Сбросится в полночь UTC.");
        }

        slot.setUnits(wanted);
        slot.setUpdatedAt(Instant.now());
        usage.save(slot);
        return new AiQuotaDtos.ConsumeResponse(true, wanted, limit, resetAt(today));
    }

    @Transactional(readOnly = true)
    public AiQuotaDtos.QuotaStatus status(Long userId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Map<String, Integer> perKind = new HashMap<>();
        for (AiUsage.Kind kind : AiUsage.Kind.values()) perKind.put(kind.name(), 0);
        int used = 0;
        for (AiUsage row : usage.findByUserIdAndDay(userId, today)) {
            perKind.put(row.getKind().name(), row.getUnits());
            used += row.getUnits();
        }
        int limit = props.reviewPerDay() + props.translatePerDay();
        return new AiQuotaDtos.QuotaStatus(used, limit, resetAt(today), perKind);
    }

    private int limitFor(AiUsage.Kind kind) {
        return switch (kind) {
            case REVIEW -> props.reviewPerDay();
            case TRANSLATE -> props.translatePerDay();
        };
    }

    private static Instant resetAt(LocalDate day) {
        return day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }
}
