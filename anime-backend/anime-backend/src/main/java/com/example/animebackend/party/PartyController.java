package com.example.animebackend.party;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Watch parties. Signed-in only; a room is reachable by its unguessable code. */
@RestController
@RequestMapping("/api/v1/parties")
public class PartyController {

    public record CreateRequest(
            @NotBlank @Size(max = 120) String animeKey,
            @Min(1) @Max(5000) int episode,
            @Min(0) double position,
            /** The host's own play state: opening a room must not pause the host. */
            boolean playing) {}

    public record StateRequest(
            @NotNull Boolean playing,
            @Min(0) double position,
            @Min(1) @Max(5000) int episode,
            @Size(max = 120) String animeKey) {}

    private final PartyService parties;

    public PartyController(PartyService parties) {
        this.parties = parties;
    }

    @PostMapping
    public PartyService.State create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateRequest body) {
        return parties.create(userId(jwt), body.animeKey(), body.episode(), body.position(), body.playing());
    }

    @PostMapping("/{code}/join")
    public PartyService.State join(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
        return parties.join(code, userId(jwt));
    }

    @PostMapping("/{code}/state")
    public PartyService.State update(
            @AuthenticationPrincipal Jwt jwt, @PathVariable String code, @Valid @RequestBody StateRequest body) {
        return parties.update(code, userId(jwt), body.playing(), body.position(), body.episode(), body.animeKey());
    }

    @PostMapping("/{code}/leave")
    public ResponseEntity<Void> leave(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
        parties.leave(code, userId(jwt));
        return ResponseEntity.noContent().build();
    }

    @GetMapping(value = "/{code}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) {
        return parties.subscribe(code, userId(jwt));
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
