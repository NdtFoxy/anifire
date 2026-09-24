package com.example.animebackend.auth.security;

import com.example.animebackend.auth.web.ApiException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * Single-use nonces for the social sign-in handshake.
 *
 * <p>The client asks for a nonce, hands it to the identity provider, and the
 * provider echoes it inside the signed ID token. Verifying it here means a token
 * minted for another site (or captured earlier) cannot be replayed against us:
 * it will not carry a nonce we issued, and any nonce we did issue dies the first
 * time it is redeemed.
 *
 * <p>In-memory by design — nonces live for two minutes and a lost one only costs
 * the user a retry. A clustered deployment moves this to Redis; the interface
 * does not change.
 */
@Service
public class SocialNonceService {

    private static final Duration TTL = Duration.ofMinutes(2);
    private static final int MAX_ENTRIES = 20_000;

    /** nonce hash → expiry. The raw nonce is never stored. */
    private final Map<String, Instant> issued = new ConcurrentHashMap<>();

    public String issue() {
        evictExpired();
        if (issued.size() >= MAX_ENTRIES) {
            // Refuse rather than let a flood push out legitimate nonces.
            throw ApiException.tooManyRequests("Попробуйте через минуту.");
        }
        String nonce = Tokens.random();
        issued.put(Tokens.sha256Hex(nonce), Instant.now().plus(TTL));
        return nonce;
    }

    /** Consumes the nonce. Returns false when it is unknown, expired or reused. */
    public boolean consume(String nonce) {
        if (nonce == null || nonce.isBlank()) return false;
        Instant expiry = issued.remove(Tokens.sha256Hex(nonce));
        return expiry != null && expiry.isAfter(Instant.now());
    }

    private void evictExpired() {
        Instant now = Instant.now();
        issued.entrySet().removeIf(e -> e.getValue().isBefore(now));
    }
}
