package com.example.animebackend.notification.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.animebackend.entity.Anime;
import com.example.animebackend.entity.Bookmark;
import com.example.animebackend.mail.EmailService;
import com.example.animebackend.notification.entity.Notification;
import com.example.animebackend.notification.repository.NotificationRepository;
import com.example.animebackend.repository.AnimeRepository;
import com.example.animebackend.repository.BookmarkRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

/** What a viewer is told when a bookmarked title gets new episodes. */
@SpringBootTest
@ActiveProfiles("test")
class EpisodeWatcherTest {

    @Autowired EpisodeWatcher watcher;
    @Autowired AnimeRepository animes;
    @Autowired BookmarkRepository bookmarks;
    @Autowired NotificationRepository notifications;
    @Autowired TransactionTemplate tx;

    private Anime anime;
    private final long ann = 900_001L;
    private final long bob = 900_002L;
    private final Map<Long, List<EmailService.NewEpisode>> digest = new HashMap<>();

    @BeforeEach
    void setUp() {
        anime = animes.save(Anime.builder().title("Watcher Test " + System.nanoTime()).build());
        bookmarks.save(Bookmark.builder().userId(ann).animeId(anime.getId()).build());
        bookmarks.save(Bookmark.builder().userId(bob).animeId(anime.getId()).build());
    }

    private int observe(int published) {
        return tx.execute(s -> watcher.record(anime, published, digest));
    }

    private List<Integer> episodesFor(long user) {
        return notifications.findByUserIdOrderByCreatedAtDesc(user, PageRequest.of(0, 50)).stream()
                .filter(n -> n.getAnimeId().equals(anime.getId()))
                .map(Notification::getEpisode)
                .sorted()
                .toList();
    }

    @Test
    void firstSightingIsABaselineNotAnAnnouncement() {
        assertThat(observe(12)).isZero();
        assertThat(episodesFor(ann)).isEmpty();
        assertThat(digest).isEmpty();
    }

    @Test
    void newEpisodeReachesEveryBookmarkingViewerOnce() {
        observe(5);
        assertThat(observe(6)).isEqualTo(2);
        assertThat(episodesFor(ann)).containsExactly(6);
        assertThat(episodesFor(bob)).containsExactly(6);
        assertThat(digest.get(ann)).extracting(EmailService.NewEpisode::watchPath)
                .containsExactly("/watch/" + anime.getId() + "?ep=6");

        // Same count again, or the source briefly reporting fewer: nothing new.
        assertThat(observe(6)).isZero();
        assertThat(observe(4)).isZero();
        assertThat(observe(6)).isZero();
        assertThat(episodesFor(ann)).containsExactly(6);
    }

    @Test
    void aBatchDropAnnouncesOnlyTheNewestEpisodes() {
        observe(1);
        observe(13);
        assertThat(episodesFor(ann)).containsExactly(11, 12, 13);
    }
}
