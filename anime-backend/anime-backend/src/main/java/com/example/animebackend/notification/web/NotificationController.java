package com.example.animebackend.notification.web;

import com.example.animebackend.notification.service.NotificationService;
import jakarta.validation.constraints.NotNull;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** The viewer's inbox. Scoped to the JWT subject, like all of /me. */
@RestController
@RequestMapping("/api/v1/me/notifications")
public class NotificationController {

    public record SettingsRequest(@NotNull Boolean episodeEmails) {}

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public NotificationService.Inbox inbox(@AuthenticationPrincipal Jwt jwt) {
        return notifications.inbox(userId(jwt));
    }

    /** Cheap poll for the bell badge. */
    @GetMapping("/unread-count")
    public Map<String, Long> unread(@AuthenticationPrincipal Jwt jwt) {
        return Map.of("unread", notifications.unread(userId(jwt)));
    }

    @PostMapping("/read")
    public Map<String, Long> markAllRead(@AuthenticationPrincipal Jwt jwt) {
        notifications.markAllRead(userId(jwt));
        return Map.of("unread", 0L);
    }

    @GetMapping("/settings")
    public NotificationService.Settings settings(@AuthenticationPrincipal Jwt jwt) {
        return notifications.settings(userId(jwt));
    }

    @PutMapping("/settings")
    public NotificationService.Settings updateSettings(
            @AuthenticationPrincipal Jwt jwt, @jakarta.validation.Valid @RequestBody SettingsRequest body) {
        return notifications.updateSettings(userId(jwt), body.episodeEmails());
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
