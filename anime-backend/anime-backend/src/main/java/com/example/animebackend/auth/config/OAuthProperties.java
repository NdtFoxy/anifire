package com.example.animebackend.auth.config;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * OIDC client configuration (prefix {@code anifire.oauth}). A provider is only
 * offered to clients once it has a client id here — an unconfigured provider is
 * reported as unavailable rather than silently accepting anything.
 *
 * <pre>
 * anifire.oauth.providers.google.client-id=...apps.googleusercontent.com
 * anifire.oauth.providers.google.issuer=https://accounts.google.com
 * anifire.oauth.providers.google.jwks-uri=https://www.googleapis.com/oauth2/v3/certs
 * </pre>
 */
@ConfigurationProperties(prefix = "anifire.oauth")
public record OAuthProperties(Map<String, Provider> providers) {

    public record Provider(String clientId, String issuer, String jwksUri) {

        public boolean configured() {
            return clientId != null
                    && !clientId.isBlank()
                    && issuer != null
                    && !issuer.isBlank()
                    && jwksUri != null
                    && !jwksUri.isBlank();
        }
    }

    public Provider get(String name) {
        return providers == null ? null : providers.get(name);
    }
}
