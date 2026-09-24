package com.example.animebackend.controller;

import com.example.animebackend.dto.WatchEventRequest;
import com.example.animebackend.geo.service.GeoAccessService;
import com.example.animebackend.service.WatchEventService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Authenticated users post here when they start watching an episode. */
@RestController
@RequestMapping("/api/v1/watch-events")
public class WatchEventController {

    private final WatchEventService service;
    private final GeoAccessService geo;

    public WatchEventController(WatchEventService service, GeoAccessService geo) {
        this.service = service;
        this.geo = geo;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void record(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody WatchEventRequest body,
            HttpServletRequest request) {
        // The country is resolved server-side from the trusted proxy header; the
        // client never gets to say where it is watching from.
        service.record(Long.valueOf(jwt.getSubject()), body, geo.resolveCountry(request));
    }
}
