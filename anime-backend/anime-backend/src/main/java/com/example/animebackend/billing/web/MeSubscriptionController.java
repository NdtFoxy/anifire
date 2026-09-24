package com.example.animebackend.billing.web;

import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.billing.dto.BillingDtos;
import com.example.animebackend.billing.service.BillingService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The caller's own subscription, under {@code /me} where the rest of the personal
 * data lives. Same payload as {@code /billing/subscription}: the client asks "what
 * do I have?" without needing to know that billing is a separate concern.
 */
@RestController
@RequestMapping("/api/v1/me")
public class MeSubscriptionController {

    private final BillingService billing;

    public MeSubscriptionController(BillingService billing) {
        this.billing = billing;
    }

    @GetMapping("/subscription")
    public BillingDtos.SubscriptionView mine(@AuthenticationPrincipal Jwt jwt) {
        if (jwt == null) throw ApiException.unauthorized("unauthorized", "Not authenticated.");
        return billing.subscription(Long.valueOf(jwt.getSubject()));
    }
}
