package com.example.animebackend.auth.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

/**
 * A provider account linked to a local user. Lookups go through
 * {@code (provider, subject)} — the OIDC subject is the only stable identifier a
 * provider guarantees. Matching on email instead is how OAuth logins turn into
 * account takeovers when an address is recycled or spoofed.
 */
@Entity
@Table(
        name = "social_identities",
        indexes = {
            @Index(name = "ux_social_identity", columnList = "provider,subject", unique = true),
            @Index(name = "ix_social_identities_user", columnList = "userId")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SocialIdentity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 16)
    private String provider;

    @Column(nullable = false)
    private String subject;

    /** Diagnostic only — the address the provider reported when linking. */
    private String emailAtLink;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant lastLoginAt;
}
