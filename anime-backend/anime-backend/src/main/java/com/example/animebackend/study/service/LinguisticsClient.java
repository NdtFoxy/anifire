package com.example.animebackend.study.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Calls the linguistics sidecar.
 *
 * <p>Plain JDK HTTP on purpose: the contract is one POST with a fixed JSON shape,
 * and going through a framework client only adds converter negotiation that can
 * silently drop the body — which is exactly what happened here during
 * development. Fewer moving parts, and the timeout is explicit.
 *
 * <p>Only invoked while building a study pack — once per (episode, language) —
 * so a slow analyser never sits on a viewer's request path. If the sidecar is
 * down the caller gets an empty list and the feature degrades to "no
 * highlighting" rather than breaking playback.
 */
@Component
public class LinguisticsClient {

    private static final Logger log = LoggerFactory.getLogger(LinguisticsClient.class);

    /**
     * @param reading  kana reading, null outside Japanese
     * @param glosses  dictionary meaning per interface language ("en", "ru"); empty when unknown
     */
    public record Token(String surface, String lemma, String pos, double zipf, int level, int line,
                        String reading, Map<String, String> glosses) {}

    private final HttpClient http = HttpClient.newBuilder()
            // uvicorn speaks HTTP/1.1 only; letting the JDK client attempt HTTP/2
            // made it send the request with an empty body, which the sidecar
            // reported as "field required".
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(3))
            .build();
    private final ObjectMapper json = new ObjectMapper();
    private final String baseUrl;

    public LinguisticsClient(@Value("${anifire.ling.url:http://127.0.0.1:8090}") String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    @SuppressWarnings("unchecked")
    public List<Token> analyze(String lang, List<String> lines) {
        try {
            String payload = json.writeValueAsString(Map.of("lang", lang, "lines", lines));
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/analyze"))
                    .header("Content-Type", "application/json")
                    // A whole episode of morphology is fast, but never unbounded.
                    .timeout(Duration.ofSeconds(60))
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response =
                    http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) {
                log.warn("Linguistics sidecar returned {} for {}: sent={} got={}", response.statusCode(), lang,
                        payload.substring(0, Math.min(160, payload.length())),
                        response.body().substring(0, Math.min(200, response.body().length())));
                return List.of();
            }
            Map<String, Object> body = json.readValue(response.body(), Map.class);
            List<Map<String, Object>> tokens = (List<Map<String, Object>>) body.get("tokens");
            if (tokens == null) return List.of();
            return tokens.stream()
                    .map(t -> new Token(
                            String.valueOf(t.get("surface")),
                            String.valueOf(t.get("lemma")),
                            String.valueOf(t.get("pos")),
                            ((Number) t.get("zipf")).doubleValue(),
                            ((Number) t.get("level")).intValue(),
                            ((Number) t.get("line")).intValue(),
                            t.get("reading") == null ? null : String.valueOf(t.get("reading")),
                            glossesOf(t)))
                    .toList();
        } catch (Exception e) {
            log.warn("Linguistics sidecar unavailable ({}): {}", lang, e.toString());
            Thread.currentThread().interrupt();
            return List.of();
        }
    }

    /** The sidecar omits the map entirely for languages with no dictionary. */
    @SuppressWarnings("unchecked")
    private static Map<String, String> glossesOf(Map<String, Object> token) {
        Object raw = token.get("gloss");
        return raw instanceof Map<?, ?> map ? (Map<String, String>) map : Map.of();
    }

    /** Whether the analyser is reachable, for the admin console. */
    public boolean healthy() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/health"))
                    .timeout(Duration.ofSeconds(2))
                    .GET()
                    .build();
            return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }
}
