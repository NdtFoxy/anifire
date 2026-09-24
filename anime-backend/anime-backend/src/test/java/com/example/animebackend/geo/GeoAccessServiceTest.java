package com.example.animebackend.geo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.geo.repository.GeoAuditRepository;
import com.example.animebackend.geo.repository.GeoRuleRepository;
import com.example.animebackend.geo.service.GeoAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Geo-fence behaviour, written from the attacker's side.
 *
 * <p>The two properties that matter: a client cannot name its own country, and a
 * broken or empty configuration lets everyone through rather than nobody.
 */
@SpringBootTest
@ActiveProfiles("test")
class GeoAccessServiceTest {

    @Autowired
    private GeoAccessService geo;

    @Autowired
    private GeoRuleRepository rules;

    @Autowired
    private GeoAuditRepository audit;

    @BeforeEach
    void clean() {
        audit.deleteAll();
        rules.deleteAll();
        geo.reload();
    }

    @Test
    void countryHeaderIsIgnoredWhenItDoesNotComeFromATrustedProxy() {
        MockHttpServletRequest spoofed = new MockHttpServletRequest();
        spoofed.setRemoteAddr("203.0.113.9"); // some random client
        spoofed.addHeader("X-Country-Code", "DE");

        // Trusting this header from anyone is the classic geo-fence bypass.
        assertThat(geo.resolveCountry(spoofed)).isNull();
    }

    @Test
    void countryIsReadFromATrustedProxy() {
        assertThat(geo.resolveCountry(request("DE"))).isEqualTo("DE");
        assertThat(geo.resolveCountry(request("de"))).isEqualTo("DE");
    }

    @Test
    void junkAndTorMarkersResolveToNoCountry() {
        assertThat(geo.resolveCountry(request("XX"))).isNull(); // Cloudflare's "unknown"
        assertThat(geo.resolveCountry(request("D"))).isNull();
        assertThat(geo.resolveCountry(request("DEU"))).isNull();
        assertThat(geo.resolveCountry(request("' OR 1=1 --"))).isNull();
    }

    @Test
    void anEmptyRuleSetBlocksNobody() {
        assertThat(geo.blockedCountries()).isEmpty();
        assertThat(geo.isBlocked("DE")).isFalse();
        // Unknown country stays allowed: a missing proxy header must not take the
        // site offline for everyone.
        assertThat(geo.isBlocked(null)).isFalse();
    }

    @Test
    void blockingAndUnblockingTakesEffectImmediatelyAndIsAudited() {
        geo.set("de", true, "licensing", 1L, "admin@example.com");

        assertThat(geo.isBlocked("DE")).isTrue();
        assertThat(geo.blockedCountries()).containsExactly("DE");

        geo.set("DE", false, null, 1L, "admin@example.com");

        assertThat(geo.isBlocked("DE")).isFalse();
        assertThat(geo.blockedCountries()).isEmpty();
        // Both decisions are on the record, newest first.
        assertThat(geo.recentAudit(10)).hasSize(2);
        assertThat(geo.recentAudit(10).getFirst().isBlocked()).isFalse();
        assertThat(geo.recentAudit(10).getFirst().getActorEmail()).isEqualTo("admin@example.com");
    }

    @Test
    void aRuleCanOnlyNameATwoLetterCode() {
        assertThatThrownBy(() -> geo.set("GERMANY", true, null, 1L, "admin@example.com"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "bad_country");
        assertThatThrownBy(() -> geo.set("<script>", true, null, 1L, "admin@example.com"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void refusalsAreCountedPerCountry() {
        long before = geo.refusalTotal();

        geo.countRefusal("DE");
        geo.countRefusal("DE");
        geo.countRefusal(null);

        assertThat(geo.refusalTotal()).isEqualTo(before + 3);
        assertThat(geo.refusalsByCountry()).containsEntry("DE", 2L).containsEntry("??", 1L);
    }

    private static MockHttpServletRequest request(String country) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("X-Country-Code", country);
        return request;
    }
}
