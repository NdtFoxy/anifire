package com.example.animebackend.geo.security;

import com.example.animebackend.geo.service.GeoAccessService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Refuses content requests from blocked countries with 451.
 *
 * <p>Deliberate exemptions, in this order:
 * <ol>
 *   <li><b>Administrators are never blocked.</b> The whole point of the feature is
 *       to close a market, not to lock its operator out of their own tooling.</li>
 *   <li><b>Authentication endpoints stay open</b> everywhere. Blocking them first
 *       would make the admin exemption unreachable: you cannot prove you are an
 *       admin if you cannot sign in.</li>
 *   <li>Health, JWKS, docs and uploaded images stay open so a blocked page still
 *       renders its explanation instead of a broken shell.</li>
 * </ol>
 *
 * <p>Runs after Spring Security's filter chain so the authenticated principal —
 * and therefore the admin exemption — is already known.
 */
@Component
@Order(Integer.MAX_VALUE - 100)
public class GeoBlockFilter extends OncePerRequestFilter {

    /** Header an admin may use to preview what a given country experiences. */
    public static final String SIMULATE_HEADER = "X-Geo-Simulate";

    private static final List<String> ALWAYS_ALLOWED = List.of(
            "/api/v1/auth/",
            "/.well-known/",
            "/uploads/",
            "/actuator/health",
            "/v3/api-docs",
            "/swagger-ui");

    private final GeoAccessService geo;

    public GeoBlockFilter(GeoAccessService geo) {
        this.geo = geo;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        if (!geo.enabled() || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String path = request.getRequestURI();
        for (String open : ALWAYS_ALLOWED) {
            if (path.startsWith(open)) {
                chain.doFilter(request, response);
                return;
            }
        }

        boolean admin = isAdmin();
        String country = geo.resolveCountry(request);

        // Admins can ask "what does Germany see?" — only admins, and only for their
        // own request, so a preview can never affect anyone else's traffic.
        String simulated = request.getHeader(SIMULATE_HEADER);
        if (admin && simulated != null && !simulated.isBlank()) {
            if (geo.isBlocked(simulated.trim().toUpperCase())) {
                refuse(response, simulated.trim().toUpperCase(), true);
                return;
            }
            chain.doFilter(request, response);
            return;
        }

        if (admin || !geo.isBlocked(country)) {
            chain.doFilter(request, response);
            return;
        }

        geo.countRefusal(country);
        refuse(response, country, false);
    }

    private static boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return false;
        for (GrantedAuthority authority : auth.getAuthorities()) {
            if ("ROLE_ADMIN".equals(authority.getAuthority())) return true;
        }
        return false;
    }

    private static void refuse(HttpServletResponse response, String country, boolean simulated)
            throws IOException {
        response.setStatus(451); // Unavailable For Legal Reasons
        response.setContentType("application/json");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write(
                """
                {"status":451,"error":"geo_blocked","country":"%s","simulated":%s,\
                "message":"Anifire is not available in your region."}"""
                        .formatted(country == null ? "" : country, simulated));
    }
}
