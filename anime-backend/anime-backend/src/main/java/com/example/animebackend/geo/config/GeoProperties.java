package com.example.animebackend.geo.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Geo-blocking configuration (prefix {@code anifire.geo}).
 *
 * @param enabled       master switch; when false nothing is ever blocked
 * @param headers       headers a country may be read from, in priority order.
 *                      Only consulted for requests arriving from {@code trustedProxies}
 *                      — a client can otherwise just send its own country.
 * @param trustedProxies CIDR-less exact remote addresses allowed to assert a country
 *                      (the CDN / reverse proxy in front of the app)
 * @param blockUnknown  whether a request with no resolvable country is blocked.
 *                      Defaults to false: punishing users because a header is
 *                      missing is how a misconfigured proxy takes a site offline.
 */
@ConfigurationProperties(prefix = "anifire.geo")
public record GeoProperties(
        boolean enabled, List<String> headers, List<String> trustedProxies, boolean blockUnknown) {

    public List<String> headerNames() {
        return headers == null || headers.isEmpty()
                ? List.of("CF-IPCountry", "X-Country-Code", "X-Geo-Country", "X-AppEngine-Country")
                : headers;
    }

    public List<String> trusted() {
        return trustedProxies == null || trustedProxies.isEmpty()
                ? List.of("127.0.0.1", "0:0:0:0:0:0:0:1", "::1")
                : trustedProxies;
    }
}
