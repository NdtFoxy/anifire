package com.example.animebackend.geo.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * Access rule for one country, keyed by ISO 3166-1 alpha-2.
 *
 * <p>Only countries an operator has touched have a row: no row means allowed.
 * That keeps the fail-safe direction correct — a truncated table, a failed
 * migration or an empty cache all degrade to "everyone may watch" rather than
 * locking out the entire audience.
 */
@Entity
@Table(name = "geo_rules")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GeoRule {

    @Id
    @Column(name = "country_code", length = 2, nullable = false)
    private String countryCode;

    @Builder.Default
    @Column(nullable = false)
    private boolean blocked = true;

    @Column(length = 255)
    private String note;

    private Long updatedBy;

    @Column(nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
