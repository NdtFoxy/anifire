package com.example.animebackend.notification.service;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.notification.entity.Notification;
import com.example.animebackend.notification.repository.NotificationRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The viewer's inbox and notification preferences. */
@Service
public class NotificationService {

    static final int INBOX_SIZE = 30;

    public record NotificationView(
            Long id, String kind, Long animeId, String animeTitle, int episode, Instant createdAt, boolean read) {}

    public record Inbox(long unread, List<NotificationView> items) {}

    public record Settings(boolean episodeEmails) {}

    private final NotificationRepository notifications;
    private final AppUserRepository users;

    public NotificationService(NotificationRepository notifications, AppUserRepository users) {
        this.notifications = notifications;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Inbox inbox(Long userId) {
        List<NotificationView> items = notifications
                .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, INBOX_SIZE))
                .stream()
                .map(n -> new NotificationView(n.getId(), n.getKind().name(), n.getAnimeId(), n.getAnimeTitle(),
                        n.getEpisode(), n.getCreatedAt(), n.getReadAt() != null))
                .toList();
        return new Inbox(notifications.countByUserIdAndReadAtIsNull(userId), items);
    }

    @Transactional(readOnly = true)
    public long unread(Long userId) {
        return notifications.countByUserIdAndReadAtIsNull(userId);
    }

    @Transactional
    public void markAllRead(Long userId) {
        notifications.markAllRead(userId, Instant.now());
    }

    @Transactional(readOnly = true)
    public Settings settings(Long userId) {
        return new Settings(user(userId).isEpisodeEmails());
    }

    @Transactional
    public Settings updateSettings(Long userId, boolean episodeEmails) {
        AppUser user = user(userId);
        user.setEpisodeEmails(episodeEmails);
        return new Settings(user.isEpisodeEmails());
    }

    private AppUser user(Long userId) {
        return users.findById(userId)
                .filter(u -> !u.isDeleted())
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "user_not_found", "Пользователь не найден."));
    }
}
