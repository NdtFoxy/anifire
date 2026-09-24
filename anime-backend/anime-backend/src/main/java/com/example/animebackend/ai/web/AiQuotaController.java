package com.example.animebackend.ai.web;

import com.example.animebackend.ai.dto.AiQuotaDtos;
import com.example.animebackend.ai.service.AiQuotaService;
import com.example.animebackend.auth.web.ApiException;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * The AI budget.
 *
 * Called server-to-server by the Next.js AI routes, which hold the user's token:
 * the browser never talks to this directly, and the routes refuse to do any work
 * until it answers.
 */
@RestController
public class AiQuotaController {

    private final AiQuotaService quota;

    public AiQuotaController(AiQuotaService quota) {
        this.quota = quota;
    }

    @PostMapping("/api/v1/ai/quota/consume")
    public AiQuotaDtos.ConsumeResponse consume(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AiQuotaDtos.ConsumeRequest body) {
        return quota.consume(userId(jwt), body.kind(), body.units());
    }

    @GetMapping("/api/v1/me/ai/quota")
    public AiQuotaDtos.QuotaStatus status(@AuthenticationPrincipal Jwt jwt) {
        return quota.status(userId(jwt));
    }

    private static Long userId(Jwt jwt) {
        if (jwt == null) throw ApiException.unauthorized("unauthorized", "Not authenticated.");
        return Long.valueOf(jwt.getSubject());
    }
}
