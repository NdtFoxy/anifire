package com.example.animebackend.geo.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/** Append-only record of every geo-rule change. */
@Entity
@Table(name = "geo_audit", indexes = @Index(name = "ix_geo_audit_recent", columnList = "createdAt"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GeoAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 2)
    private String countryCode;

    @Column(nullable = false)
    private boolean blocked;

    @Column(length = 255)
    private String note;

    private Long actorId;

    private String actorEmail;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
