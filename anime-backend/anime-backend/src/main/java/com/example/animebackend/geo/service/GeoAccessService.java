package com.example.animebackend.geo.service;

import com.example.animebackend.geo.config.GeoProperties;
import com.example.animebackend.geo.entity.GeoAudit;
import com.example.animebackend.geo.entity.GeoRule;
import com.example.animebackend.geo.repository.GeoAuditRepository;
import com.example.animebackend.geo.repository.GeoRuleRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decides whether a request's country may use the site, and owns the rule set.
 *
 * <p>Two things make this safe to run in front of every request:
 * <ul>
 *   <li><b>The blocklist is cached in memory</b> and refreshed on write. The filter
 *       runs on every call and must never add a database round trip.</li>
 *   <li><b>Failure is open.</b> No rules, no country, or a lookup problem means the
 *       request proceeds. A geo-fence that fails closed takes the whole site down
 *       the moment a proxy header changes name.</li>
 * </ul>
 *
 * <p>The country itself is only read from a header when the request came from a
 * trusted proxy address. Otherwise anyone could send {@code CF-IPCountry: US} and
 * walk through the fence — which is exactly the bug most naive implementations have.
 */
@Service
public class GeoAccessService {

    private static final Logger log = LoggerFactory.getLogger(GeoAccessService.class);

    private final GeoRuleRepository rules;
    private final GeoAuditRepository audit;
    private final GeoProperties props;

    /** Blocked ISO codes, replaced wholesale on every change. */
    private volatile Set<String> blocked = Set.of();
    /** Per-country counter of refused requests, for the admin dashboard. */
    private final Map<String, LongAdder> refusals = new ConcurrentHashMap<>();
    private final AtomicLong refusalTotal = new AtomicLong();

    public GeoAccessService(GeoRuleRepository rules, GeoAuditRepository audit, GeoProperties props) {
        this.rules = rules;
        this.audit = audit;
        this.props = props;
        reload();
    }

    @Transactional(readOnly = true)
    public final void reload() {
        try {
            blocked = rules.findByBlockedTrue().stream()
                    .map(GeoRule::getCountryCode)
                    .collect(java.util.stream.Collectors.toUnmodifiableSet());
        } catch (Exception e) {
            // Startup before the migration, or a database blip: stay open.
            log.warn("Geo rules unavailable, allowing all traffic: {}", e.toString());
            blocked = Set.of();
        }
    }

    public boolean enabled() {
        return props.enabled();
    }

    public Set<String> blockedCountries() {
        return blocked;
    }

    /**
     * Country for this request, or {@code null} when unknown. Header values are only
     * honoured from a trusted proxy; anything else is ignored on purpose.
     */
    public String resolveCountry(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        if (remote == null || !props.trusted().contains(remote)) {
            return null;
        }
        for (String header : props.headerNames()) {
            String value = request.getHeader(header);
            if (value == null) continue;
            String code = normalize(value);
            if (code != null) return code;
        }
        return null;
    }

    /** True when this country is currently refused. Unknown follows {@code blockUnknown}. */
    public boolean isBlocked(String countryCode) {
        if (!props.enabled()) return false;
        if (countryCode == null) return props.blockUnknown();
        return blocked.contains(countryCode);
    }

    public void countRefusal(String countryCode) {
        refusals.computeIfAbsent(countryCode == null ? "??" : countryCode, k -> new LongAdder()).increment();
        refusalTotal.incrementAndGet();
    }

    public Map<String, Long> refusalsByCountry() {
        Map<String, Long> out = new java.util.LinkedHashMap<>();
        refusals.forEach((code, adder) -> out.put(code, adder.sum()));
        return out;
    }

    public long refusalTotal() {
        return refusalTotal.get();
    }

    @Transactional(readOnly = true)
    public List<GeoRule> all() {
        return rules.findAll();
    }

    @Transactional(readOnly = true)
    public List<GeoAudit> recentAudit(int limit) {
        return audit.findAllByOrderByCreatedAtDesc(PageRequest.of(0, Math.clamp(limit, 1, 200)));
    }

    /** Applies one rule and records who did it. Returns the stored state. */
    @Transactional
    public GeoRule set(String rawCode, boolean block, String note, Long actorId, String actorEmail) {
        String code = normalize(rawCode);
        if (code == null) {
            throw com.example.animebackend.auth.web.ApiException.badRequest(
                    "bad_country", "Use a two-letter ISO country code.");
        }
        GeoRule rule = rules.findById(code).orElseGet(() -> GeoRule.builder().countryCode(code).build());
        rule.setBlocked(block);
        rule.setNote(note == null || note.isBlank() ? null : note.trim());
        rule.setUpdatedBy(actorId);
        rule.setUpdatedAt(Instant.now());
        GeoRule saved = rules.save(rule);

        audit.save(GeoAudit.builder()
                .countryCode(code)
                .blocked(block)
                .note(rule.getNote())
                .actorId(actorId)
                .actorEmail(actorEmail)
                .build());
        reload();
        log.info("Geo rule {} -> {} by admin {}", code, block ? "BLOCKED" : "allowed", actorEmail);
        return saved;
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String code = value.trim().toUpperCase(Locale.ROOT);
        // "XX" is Cloudflare's marker for Tor / unknown; treat it as no country.
        if (code.length() != 2 || !code.chars().allMatch(Character::isLetter) || code.equals("XX")) {
            return null;
        }
        return code;
    }
}
