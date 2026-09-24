package com.example.animebackend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.auth.config.OAuthProperties;
import com.example.animebackend.auth.dto.SocialLoginRequest;
import com.example.animebackend.auth.security.OidcTokenVerifier;
import com.example.animebackend.auth.security.SocialNonceService;
import com.example.animebackend.auth.service.AuthService;
import com.example.animebackend.auth.web.ApiException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Attack-shaped tests for federated sign-in. Each case is a real bypass someone
 * would try; all of them must end in a rejection, and none of them may reveal
 * which check failed.
 *
 * <p>The token-shaped cases never reach the network: they die on nonce, shape or
 * signature-selection before any JWKS fetch, which is exactly the ordering we
 * want — the cheap, offline checks first.
 */
@SpringBootTest
@ActiveProfiles("test")
class SocialLoginSecurityTest {

    private static final String CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    private static final String ISSUER = "https://accounts.google.com";

    @Autowired
    private AuthService authService;

    @Autowired
    private OidcTokenVerifier verifier;

    @Autowired
    private SocialNonceService nonces;

    @Autowired
    private OAuthProperties props;

    @Test
    void providerAloneNeverAuthenticates() {
        // The old demo path signed anyone in on a provider name. It must be gone:
        // a blank credential cannot pass validation or verification.
        assertThatThrownBy(
                        () ->
                                authService.socialLogin(
                                        new SocialLoginRequest("google", "", ""), "1.2.3.4", "junit"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void unconfiguredProviderIsRefused() {
        assertThat(verifier.available("apple")).isFalse();
        assertThatThrownBy(() -> verifier.verify("apple", "x.y.z", nonces.issue()))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "provider_unavailable");
    }

    @Test
    void unsignedTokenIsRefused() throws Exception {
        String nonce = nonces.issue();
        // alg:none — the oldest JWT trick there is.
        String token = new PlainJWT(claims(nonce).build()).serialize();

        assertThatThrownBy(() -> verifier.verify("google", token, nonce))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "invalid_token");
    }

    @Test
    void attackerSignedTokenIsRefused() throws Exception {
        String nonce = nonces.issue();
        // A perfectly-formed token signed with the attacker's own RSA key: every
        // claim says the right thing, but the key is not in Google's JWKS.
        RSAKey key = new RSAKeyGenerator(2048).keyID("evil").generate();
        SignedJWT jwt =
                new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("evil").build(),
                        claims(nonce).build());
        jwt.sign(new RSASSASigner(key));

        assertThatThrownBy(() -> verifier.verify("google", jwt.serialize(), nonce))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "invalid_token");
    }

    @Test
    void symmetricallySignedTokenIsRefused() throws Exception {
        String nonce = nonces.issue();
        // HS256 confusion: sign with a shared secret and hope the verifier accepts
        // any algorithm. Only RS256/ES256 are selectable, so it cannot.
        SignedJWT jwt =
                new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims(nonce).build());
        jwt.sign(new MACSigner("0123456789abcdef0123456789abcdef"));

        assertThatThrownBy(() -> verifier.verify("google", jwt.serialize(), nonce))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "invalid_token");
    }

    @Test
    void nonceIsSingleUse() {
        String nonce = nonces.issue();
        assertThat(nonces.consume(nonce)).isTrue();
        assertThat(nonces.consume(nonce)).isFalse();
    }

    @Test
    void unknownNonceIsRefusedBeforeAnythingElse() {
        assertThatThrownBy(() -> verifier.verify("google", "a.b.c", "never-issued"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "invalid_nonce");
    }

    @Test
    void oversizedTokenIsRefusedWithoutParsing() {
        String nonce = nonces.issue();
        String huge = "a".repeat(9_000);
        assertThatThrownBy(() -> verifier.verify("google", huge, nonce))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "invalid_token");
        // The nonce survives, because the size check runs first.
        assertThat(nonces.consume(nonce)).isTrue();
    }

    @Test
    void googleProviderIsConfiguredForTests() {
        OAuthProperties.Provider google = props.get("google");
        assertThat(google).isNotNull();
        assertThat(google.configured()).isTrue();
        assertThat(google.issuer()).isEqualTo(ISSUER);
    }

    /** Claims a legitimate Google ID token would carry. */
    private static JWTClaimsSet.Builder claims(String nonce) {
        Instant now = Instant.now();
        return new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .audience(List.of(CLIENT_ID))
                .subject("109876543210987654321")
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(300)))
                .claim("email", "victim@example.com")
                .claim("email_verified", true)
                .claim("nonce", nonce);
    }
}
