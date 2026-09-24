package com.example.animebackend.geo.web;

import com.example.animebackend.geo.entity.GeoAudit;
import com.example.animebackend.geo.entity.GeoRule;
import com.example.animebackend.geo.dto.CountryStats;
import com.example.animebackend.geo.service.GeoAccessService;
import com.example.animebackend.geo.service.GeoStatsService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * Geo-rule administration. Mapped under {@code /api/v1/admin}, which
 * SecurityConfig already restricts to ROLE_ADMIN, so every method here is
 * admin-only by construction rather than by a check someone can forget.
 */
@Validated
@RestController
@RequestMapping("/api/v1/admin/geo")
public class GeoAdminController {

    public record RuleRequest(
            @Pattern(regexp = "^[A-Za-z]{2}$", message = "Двухбуквенный код ISO") String country,
            boolean blocked,
            @Size(max = 255) String note) {}

    public record RuleView(String country, boolean blocked, String note, Instant updatedAt) {
        static RuleView of(GeoRule rule) {
            return new RuleView(rule.getCountryCode(), rule.isBlocked(), rule.getNote(), rule.getUpdatedAt());
        }
    }

    public record AuditView(
            String country, boolean blocked, String note, String actorEmail, Instant at) {
        static AuditView of(GeoAudit row) {
            return new AuditView(
                    row.getCountryCode(), row.isBlocked(), row.getNote(), row.getActorEmail(), row.getCreatedAt());
        }
    }

    private final GeoAccessService geo;
    private final GeoStatsService stats;

    public GeoAdminController(GeoAccessService geo, GeoStatsService stats) {
        this.geo = geo;
        this.stats = stats;
    }

    /** Current rules plus live refusal counters for the map. */
    @GetMapping
    public Map<String, Object> overview() {
        return Map.of(
                "enabled", geo.enabled(),
                "blocked", geo.blockedCountries(),
                "rules", geo.all().stream().map(RuleView::of).toList(),
                "refusals", geo.refusalsByCountry(),
                "refusalTotal", geo.refusalTotal());
    }

    @PutMapping
    public RuleView set(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RuleRequest body) {
        return RuleView.of(geo.set(
                body.country(),
                body.blocked(),
                body.note(),
                Long.valueOf(jwt.getSubject()),
                jwt.getClaimAsString("email")));
    }

    /** Everything worth knowing about one country before blocking it. */
    @GetMapping("/{country}/stats")
    public CountryStats stats(
            @PathVariable @Pattern(regexp = "^[A-Za-z]{2}$") String country,
            @RequestParam(defaultValue = "all")
                    @Pattern(regexp = "^(24h|7d|30d|all)$") String period) {
        return stats.forCountry(country, period);
    }

    @GetMapping("/audit")
    public List<AuditView> audit(@RequestParam(defaultValue = "50") int limit) {
        return geo.recentAudit(limit).stream().map(AuditView::of).toList();
    }
}
