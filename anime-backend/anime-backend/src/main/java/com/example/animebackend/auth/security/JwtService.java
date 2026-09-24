package com.example.animebackend.auth.security;

import com.example.animebackend.auth.config.JwtProperties;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.billing.service.Entitlement;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** Mints short-lived RS256 access tokens. */
@Service
public class JwtService {

    public record AccessToken(String value, long expiresInSeconds) {}

    private final JwtEncoder encoder;
    private final JwtProperties props;

    public JwtService(JwtEncoder encoder, JwtProperties props) {
        this.encoder = encoder;
        this.props = props;
    }

    /**
     * Mints an access token stamped with the caller's current entitlement. The claim is
     * only as fresh as the 15-minute TTL, so anything that must react immediately to a
     * purchase (ad decisioning) re-reads the entitlement server-side instead.
     */
    public AccessToken issue(AppUser user, Entitlement entitlement) {
        Instant now = Instant.now();
        Instant exp = now.plus(props.accessTtl());

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .issuedAt(now)
                .expiresAt(exp)
                .subject(String.valueOf(user.getId()))
                .audience(List.of(props.audience()))
                .id(UUID.randomUUID().toString())
                .claim("email", user.getEmail())
                .claim("roles", List.of(user.getRole().name()))
                .claim("emailVerified", user.isEmailVerified())
                .claim("adsFree", entitlement.adsFree())
                .claim("typ", "access")
                .build();

        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new AccessToken(token, props.accessTtl().getSeconds());
    }
}
