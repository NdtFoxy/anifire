package com.example.animebackend.auth.security;

import com.example.animebackend.auth.config.OAuthProperties;
import com.example.animebackend.auth.web.ApiException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.net.URL;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Verifies an OpenID Connect ID token end to end before it is allowed to name a
 * user. Everything a forged or borrowed token could lie about is checked:
 *
 * <ul>
 *   <li><b>Signature</b> against the provider's published JWKS (fetched over TLS,
 *       cached, refreshed on unknown key id) — rules out home-made tokens.</li>
 *   <li><b>alg</b> restricted to RS256/ES256 per provider, so an {@code alg:none}
 *       or HMAC-with-the-public-key token is rejected at selection time.</li>
 *   <li><b>iss</b> exact match — a token from a different issuer is not ours.</li>
 *   <li><b>aud</b> equals our client id — a token minted for another site (the
 *       classic "confused deputy") cannot be handed to us.</li>
 *   <li><b>exp / iat</b> with a 60s clock skew — no expired or future tokens.</li>
 *   <li><b>nonce</b> must be one we issued and never redeemed — kills replay.</li>
 *   <li><b>email_verified</b> must be true — an unverified provider address is
 *       not proof of anything.</li>
 * </ul>
 */
@Service
public class OidcTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(OidcTokenVerifier.class);
    private static final int MAX_TOKEN_CHARS = 8_192;
    private static final long SKEW_SECONDS = 60;
    private static final Set<JWSAlgorithm> ALLOWED_ALGS =
            Set.of(JWSAlgorithm.RS256, JWSAlgorithm.ES256);

    /** Verified identity: the provider subject plus the claims we actually use. */
    public record Identity(String provider, String subject, String email, String name) {}

    private final OAuthProperties props;
    private final SocialNonceService nonces;
    /** One JWKS-backed processor per provider; each caches keys internally. */
    private final Map<String, ConfigurableJWTProcessor<SecurityContext>> processors =
            new ConcurrentHashMap<>();

    public OidcTokenVerifier(OAuthProperties props, SocialNonceService nonces) {
        this.props = props;
        this.nonces = nonces;
    }

    public boolean available(String provider) {
        OAuthProperties.Provider cfg = props.get(provider);
        return cfg != null && cfg.configured();
    }

    public Identity verify(String provider, String idToken, String nonce) {
        OAuthProperties.Provider cfg = props.get(provider);
        if (cfg == null || !cfg.configured()) {
            throw ApiException.badRequest(
                    "provider_unavailable", "That sign-in provider is not enabled.");
        }
        if (idToken == null || idToken.isBlank() || idToken.length() > MAX_TOKEN_CHARS) {
            throw ApiException.unauthorized("invalid_token", "Sign-in failed. Try again.");
        }
        // Burn the nonce before touching the token: a replayed token must fail even
        // if it is otherwise perfectly valid.
        if (!nonces.consume(nonce)) {
            throw ApiException.unauthorized("invalid_nonce", "Sign-in expired. Try again.");
        }

        JWTClaimsSet claims;
        try {
            claims = processor(provider, cfg).process(idToken, null);
        } catch (Exception e) {
            // The reason is logged for operators but never returned: telling a caller
            // which check failed is a free oracle for forging the next attempt.
            log.warn("Rejected {} ID token: {}", provider, e.toString());
            throw ApiException.unauthorized("invalid_token", "Sign-in failed. Try again.");
        }

        String tokenNonce = asString(claims.getClaim("nonce"));
        if (tokenNonce == null || !Tokens.constantTimeEquals(tokenNonce, nonce)) {
            throw ApiException.unauthorized("invalid_nonce", "Sign-in expired. Try again.");
        }

        // A token addressed to several parties at once is not exclusively ours;
        // and an `iat` in the future means a clock lie, not a fresh login.
        List<String> audiences = claims.getAudience();
        if (audiences == null || audiences.size() != 1) {
            throw ApiException.unauthorized("invalid_token", "Sign-in failed. Try again.");
        }
        Date issuedAt = claims.getIssueTime();
        if (issuedAt == null
                || issuedAt.toInstant().isAfter(Instant.now().plusSeconds(SKEW_SECONDS))) {
            throw ApiException.unauthorized("invalid_token", "Sign-in failed. Try again.");
        }

        // Google sets `azp` when the token was minted for a different party than
        // the audience; if present it must still be us.
        String azp = asString(claims.getClaim("azp"));
        if (azp != null && !azp.equals(cfg.clientId())) {
            throw ApiException.unauthorized("invalid_token", "Sign-in failed. Try again.");
        }

        String subject = claims.getSubject();
        String email = asString(claims.getClaim("email"));
        Object verified = claims.getClaim("email_verified");
        boolean emailVerified =
                verified instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(verified));

        if (subject == null || subject.isBlank() || email == null || email.isBlank()) {
            throw ApiException.unauthorized("invalid_token", "Sign-in failed. Try again.");
        }
        if (!emailVerified) {
            throw ApiException.badRequest(
                    "email_unverified", "Verify your email with that provider first.");
        }

        return new Identity(provider, subject, email.trim().toLowerCase(), asString(claims.getClaim("name")));
    }

    private ConfigurableJWTProcessor<SecurityContext> processor(
            String provider, OAuthProperties.Provider cfg) {
        return processors.computeIfAbsent(
                provider,
                key -> {
                    try {
                        JWKSource<SecurityContext> jwks =
                                JWKSourceBuilder.create(new URL(cfg.jwksUri()))
                                        .cache(Duration.ofMinutes(15).toMillis(), Duration.ofSeconds(30).toMillis())
                                        .rateLimited(Duration.ofSeconds(30).toMillis())
                                        .build();
                        DefaultJWTProcessor<SecurityContext> jwt = new DefaultJWTProcessor<>();
                        jwt.setJWSKeySelector(new JWSVerificationKeySelector<>(ALLOWED_ALGS, jwks));
                        DefaultJWTClaimsVerifier<SecurityContext> claims =
                                new DefaultJWTClaimsVerifier<SecurityContext>(
                                        // HashSet, not Set.of: Nimbus probes these with
                                        // contains(null), which throws on an immutable set.
                                        new HashSet<>(List.of(cfg.clientId())),
                                        new JWTClaimsSet.Builder().issuer(cfg.issuer()).build(),
                                        new HashSet<>(List.of("sub", "iat", "exp", "nonce")),
                                        new HashSet<>());
                        claims.setMaxClockSkew((int) SKEW_SECONDS);
                        jwt.setJWTClaimsSetVerifier(claims);
                        return jwt;
                    } catch (Exception e) {
                        throw new IllegalStateException("Bad OIDC configuration for " + provider, e);
                    }
                });
    }

    private static String asString(Object claim) {
        return claim instanceof String s && !s.isBlank() ? s : null;
    }
}
