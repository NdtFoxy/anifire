package com.example.animebackend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.ads.entity.AdEvent;
import com.example.animebackend.ads.repository.AdEventRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Boots the application against a real Postgres with the production schema path:
 * Flyway applies every migration to an empty database and Hibernate validates the
 * entities against the result. The H2 suite generates its schema from the entities,
 * so it can never catch a mapping change that lacks a migration, a broken
 * migration, or SQL that only Postgres understands — this test can.
 */
@Tag("postgres")
@Testcontainers
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate",
})
class PostgresSchemaIT {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    @Autowired
    Flyway flyway;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    AdEventRepository adEvents;

    @Test
    void everyMigrationAppliesToAnEmptyDatabase() {
        MigrationInfo[] pending = flyway.info().pending();
        assertThat(pending).isEmpty();
        assertThat(flyway.info().applied())
                .isNotEmpty()
                .allSatisfy(m -> assertThat(m.getState().isFailed()).isFalse());
    }

    @Test
    void adReportingUsesPostgresOnlySqlAndDedupesBeacons() {
        Instant now = Instant.now();
        Long campaignId = jdbc.queryForObject("""
                insert into ad_campaigns (name, advertiser, advertiser_inn, status, created_at)
                values ('it', 'Anifire', '7700000000', 'ACTIVE', ?) returning id
                """, Long.class, java.sql.Timestamp.from(now));
        Long creativeId = jdbc.queryForObject("""
                insert into ad_creatives (campaign_id, src, duration_sec, created_at)
                values (?, 'https://ads.example/a.mp4', 15, ?) returning id
                """, Long.class, campaignId, java.sql.Timestamp.from(now));
        for (String decision : List.of("d-1", "d-2")) {
            jdbc.update("""
                    insert into ad_decisions (id, creative_id, campaign_id, created_at)
                    values (?, ?, ?, ?)
                    """, decision, creativeId, campaignId, java.sql.Timestamp.from(now));
        }

        adEvents.saveAll(List.of(
                event("d-1", campaignId, creativeId, AdEvent.Kind.START, now),
                event("d-2", campaignId, creativeId, AdEvent.Kind.START, now),
                event("d-2", campaignId, creativeId, AdEvent.Kind.CLICK, now)));

        // A retried beacon for the same (decision, kind) must be rejected by the
        // unique index, otherwise impressions would be double-billed.
        assertThatThrownBy(() -> adEvents.saveAndFlush(
                event("d-1", campaignId, creativeId, AdEvent.Kind.START, now)))
                .isInstanceOf(DataIntegrityViolationException.class);

        List<Object[]> daily = adEvents.dailySince(now.minus(1, ChronoUnit.DAYS));
        assertThat(daily).hasSize(1);
        assertThat(((Number) daily.get(0)[1]).longValue()).as("impressions").isEqualTo(2);
        assertThat(((Number) daily.get(0)[2]).longValue()).as("clicks").isEqualTo(1);
    }

    private static AdEvent event(String decision, Long campaign, Long creative, AdEvent.Kind kind, Instant at) {
        return AdEvent.builder()
                .decisionId(decision)
                .campaignId(campaign)
                .creativeId(creative)
                .kind(kind)
                .createdAt(at)
                .build();
    }
}
