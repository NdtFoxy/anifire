package com.example.animebackend.auth.security;

import com.example.animebackend.auth.config.CorsProperties;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless JWT resource-server config.
 *
 * <p>CSRF is disabled at the filter level (we use Bearer tokens, not session cookies);
 * the only cookie-authenticated endpoints (/refresh, /logout) enforce their own
 * SameSite=Strict + double-submit CSRF check in the controller.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final CorsProperties corsProps;

    public SecurityConfig(CorsProperties corsProps) {
        this.corsProps = corsProps;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        AuthenticationEntryPoint entryPoint =
                (req, res, ex) -> writeError(res, 401, "unauthorized", "Authentication required.");
        AccessDeniedHandler deniedHandler =
                (req, res, ex) -> writeError(res, 403, "forbidden", "You don't have access to this resource.");

        http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/v1/auth/me", "/api/v1/auth/me/**").authenticated()
                        .requestMatchers("/api/v1/auth/**").permitAll()
                        // Personal data: progress, bookmarks, friends. Stated explicitly so a
                        // future permitAll on a broader pattern cannot quietly expose it.
                        .requestMatchers("/api/v1/me/**").authenticated()
                        // Billing. The provider callback is the single unauthenticated
                        // write in the API — it carries no credentials by nature, and
                        // nothing it claims is trusted (BillingService re-reads the
                        // payment from the provider). Prices are public; buying,
                        // cancelling and reading your own subscription are not.
                        .requestMatchers("/api/v1/billing/webhook/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/billing/plans").permitAll()
                        .requestMatchers("/api/v1/billing/**").authenticated()
                        // AI features cost GPU time, so they are never anonymous. The
                        // Next.js routes call these with the caller's own token.
                        .requestMatchers("/api/v1/ai/**").authenticated()
                        // Ad beacons come from viewers without an account — that is who
                        // ads are for. The decision id in the body was minted by us, so
                        // an open POST here cannot invent an impression for a campaign
                        // the caller was never served.
                        .requestMatchers(HttpMethod.POST, "/api/v1/ads/events").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/.well-known/jwks.json").permitAll()
                        .requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/animes/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/categories/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/comments/**").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/animes/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/categories/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/categories/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/categories/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                        .authenticationEntryPoint(entryPoint))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(deniedHandler))
                .headers(h -> h
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(Customizer.withDefaults())
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000))
                        .referrerPolicy(r -> r.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)));

        return http.build();
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(corsProps.allowedOrigins());
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        // X-Geo-Simulate carries an admin's region preview; without it here the browser
        // drops the header at preflight and the preview silently does nothing.
        cfg.setAllowedHeaders(
                List.of("Authorization", "Content-Type", "X-CSRF-Token", "X-Geo-Simulate"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }

    private static void writeError(HttpServletResponse res, int status, String code, String message)
            throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        // Static, quote-free constants — safe to inline without a JSON serializer.
        res.getWriter().write(
                "{\"status\":" + status + ",\"error\":\"" + code + "\",\"message\":\"" + message + "\"}");
    }
}
