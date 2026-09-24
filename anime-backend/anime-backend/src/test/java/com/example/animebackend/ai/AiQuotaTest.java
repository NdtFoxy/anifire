package com.example.animebackend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.ai.entity.AiUsage;
import com.example.animebackend.ai.repository.AiUsageRepository;
import com.example.animebackend.ai.service.AiQuotaService;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.repository.AppUserRepository;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * The AI budget is a cost control, so the contract is about money, not features:
 * a refusal must not consume anything, the two features must not share a pool, and
 * the ledger must survive a restart — which is exactly what an in-memory counter
 * could not do.
 */
@SpringBootTest
@ActiveProfiles("test")
class AiQuotaTest {

    @Autowired
    private AiQuotaService quota;

    @Autowired
    private AiUsageRepository usage;

    @Autowired
    private AppUserRepository users;

    private Long userId;

    @BeforeEach
    void seed() {
        usage.deleteAll();
        userId = users.save(AppUser.builder()
                        .email("ai-" + System.nanoTime() + "@example.com")
                        .passwordHash("x")
                        .displayName("AI user")
                        .role(Role.USER)
                        .emailVerified(true)
                        .build())
                .getId();
    }

    @Test
    void unitsAccumulateAcrossCalls() {
        quota.consume(userId, AiUsage.Kind.TRANSLATE, 5);
        var second = quota.consume(userId, AiUsage.Kind.TRANSLATE, 7);

        assertThat(second.used()).isEqualTo(12);
        assertThat(second.allowed()).isTrue();
        assertThat(second.resetAt()).isEqualTo(
                LocalDate.now(ZoneOffset.UTC).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant());
    }

    @Test
    void refusalLeavesTheLedgerUntouched() {
        int limit = quota.status(userId).kinds().size(); // sanity: both kinds present
        assertThat(limit).isEqualTo(2);

        // Fill the review budget exactly, then ask for one more.
        for (int i = 0; i < 20; i++) quota.consume(userId, AiUsage.Kind.REVIEW, 1);
        int before = quota.status(userId).kinds().get("REVIEW");

        assertThatThrownBy(() -> quota.consume(userId, AiUsage.Kind.REVIEW, 1))
                .hasMessageContaining("Daily AI limit");

        assertThat(quota.status(userId).kinds().get("REVIEW")).isEqualTo(before);
    }

    /** An oversized single request is refused whole, not partially booked. */
    @Test
    void oversizedRequestIsRefusedWithoutPartialCharge() {
        assertThatThrownBy(() -> quota.consume(userId, AiUsage.Kind.REVIEW, 200))
                .hasMessageContaining("Daily AI limit");

        assertThat(quota.status(userId).kinds().get("REVIEW")).isZero();
    }

    /** Spending one feature must not close the other. */
    @Test
    void budgetsAreIndependentPerFeature() {
        for (int i = 0; i < 20; i++) quota.consume(userId, AiUsage.Kind.REVIEW, 1);

        var translate = quota.consume(userId, AiUsage.Kind.TRANSLATE, 40);

        assertThat(translate.allowed()).isTrue();
        assertThat(translate.used()).isEqualTo(40);
    }

    /** One account's spending is not another's. */
    @Test
    void quotaIsPerAccount() {
        Long other = users.save(AppUser.builder()
                        .email("ai-other-" + System.nanoTime() + "@example.com")
                        .passwordHash("x")
                        .displayName("Other")
                        .role(Role.USER)
                        .emailVerified(true)
                        .build())
                .getId();

        for (int i = 0; i < 20; i++) quota.consume(userId, AiUsage.Kind.REVIEW, 1);

        assertThat(quota.consume(other, AiUsage.Kind.REVIEW, 1).used()).isEqualTo(1);
    }
}
