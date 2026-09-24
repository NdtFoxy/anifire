package com.example.animebackend.notification.service;

import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.Bookmark;
import com.example.animebackend.mail.EmailService;
import com.example.animebackend.notification.entity.AnimeReleaseState;
import com.example.animebackend.notification.entity.Notification;
import com.example.animebackend.notification.repository.AnimeReleaseStateRepository;
import com.example.animebackend.notification.repository.NotificationRepository;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.BookmarkRepository;
import com.example.animebackend.service.VideoSourceService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Polls the video source for bookmarked titles and turns newly published
 * episodes into inbox entries plus one email digest per viewer and run.
 *
 * Network calls run outside any transaction; each title's bookkeeping commits on
 * its own, so one slow or failing lookup never holds locks or rolls back the rest.
 */
@Service
public class EpisodeWatcher {

    private static final Logger log = LoggerFactory.getLogger(EpisodeWatcher.class);

    /**
     * A release that jumps by a whole season at once (a re-upload, a batch drop)
     * announces only its newest episodes instead of flooding every inbox.
     */
    static final int MAX_EPISODES_PER_TITLE = 3;

    private final BookmarkRepository bookmarks;
    private final AnimeRepository animes;
    private final AnimeReleaseStateRepository states;
    private final NotificationRepository notifications;
    private final AppUserRepository users;
    private final VideoSourceService videoSource;
    private final EmailService email;
    private final TransactionTemplate tx;
    private final boolean enabled;

    public EpisodeWatcher(
            BookmarkRepository bookmarks,
            AnimeRepository animes,
            AnimeReleaseStateRepository states,
            NotificationRepository notifications,
            AppUserRepository users,
            VideoSourceService videoSource,
            EmailService email,
            TransactionTemplate tx,
            @Value("${anifire.notifications.enabled:true}") boolean enabled) {
        this.bookmarks = bookmarks;
        this.animes = animes;
        this.states = states;
        this.notifications = notifications;
        this.users = users;
        this.videoSource = videoSource;
        this.email = email;
        this.tx = tx;
        this.enabled = enabled;
    }

    @Scheduled(
            initialDelayString = "${anifire.notifications.initial-delay:PT2M}",
            fixedDelayString = "${anifire.notifications.poll-interval:PT1H}")
    public void poll() {
        if (enabled) run();
    }

    /** One full pass; returns how many inbox entries were created. */
    public int run() {
        Map<Long, List<EmailService.NewEpisode>> digest = new LinkedHashMap<>();
        int created = 0;
        for (Long animeId : bookmarks.findBookmarkedAnimeIds()) {
            Anime anime = animes.findByIdAndIsDeletedFalse(animeId).orElse(null);
            if (anime == null) continue;
            OptionalInt published = videoSource.publishedEpisodes(anime);
            if (published.isEmpty()) continue;
            Integer made = tx.execute(status -> record(anime, published.getAsInt(), digest));
            created += made == null ? 0 : made;
        }
        digest.forEach(this::mail);
        if (created > 0) log.info("Episode watcher: {} notifications for {} viewers", created, digest.size());
        return created;
    }

    /** Package-private for tests: applies one observation of a title's episode count. */
    int record(Anime anime, int published, Map<Long, List<EmailService.NewEpisode>> digest) {
        Instant now = Instant.now();
        AnimeReleaseState state = states.findById(anime.getId()).orElse(null);
        if (state == null) {
            // First sighting only sets the baseline.
            states.save(new AnimeReleaseState(anime.getId(), published, now));
            return 0;
        }
        int previous = state.getPublishedEpisodes();
        state.setCheckedAt(now);
        if (published <= previous) {
            // Fewer episodes is a source-side hiccup, not an event; keep the high-water mark.
            return 0;
        }
        state.setPublishedEpisodes(published);

        int created = 0;
        int from = Math.max(previous + 1, published - MAX_EPISODES_PER_TITLE + 1);
        List<Bookmark> watchers = bookmarks.findByAnimeId(anime.getId());
        for (int episode = from; episode <= published; episode++) {
            for (Bookmark b : watchers) {
                if (notifications.existsByUserIdAndKindAndAnimeIdAndEpisode(
                        b.getUserId(), Notification.Kind.NEW_EPISODE, anime.getId(), episode)) {
                    continue;
                }
                notifications.save(Notification.builder()
                        .userId(b.getUserId())
                        .kind(Notification.Kind.NEW_EPISODE)
                        .animeId(anime.getId())
                        .animeTitle(anime.getTitle())
                        .episode(episode)
                        .createdAt(now)
                        .build());
                digest.computeIfAbsent(b.getUserId(), k -> new ArrayList<>())
                        .add(new EmailService.NewEpisode(
                                anime.getTitle(), episode, "/watch/" + anime.getId() + "?ep=" + episode));
                created++;
            }
        }
        return created;
    }

    private void mail(Long userId, List<EmailService.NewEpisode> episodes) {
        users.findById(userId)
                .filter(u -> !u.isDeleted() && u.isEmailVerified() && u.isEpisodeEmails())
                .ifPresent(u -> email.sendNewEpisodes(u.getEmail(), episodes));
    }
}
