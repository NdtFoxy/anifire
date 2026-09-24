package com.example.animebackend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Social sign-in payload. {@code idToken} is the provider's signed ID token and
 * {@code nonce} is the single-use value this server handed out for this attempt —
 * both are mandatory, so there is no path that authenticates on a provider name
 * alone.
 */
public record SocialLoginRequest(
        @NotBlank String provider,
        @NotBlank @Size(max = 8192) String idToken,
        @NotBlank @Size(max = 128) String nonce) {}
