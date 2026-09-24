package com.example.animebackend.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.dto.WatchProgressDto;
import com.example.animebackend.dto.WatchProgressRequest;
import com.example.animebackend.entity.WatchEvent;
import com.example.animebackend.repository.WatchEventRepository;
import com.example.animebackend.service.FriendshipService;
import com.example.animebackend.service.WatchProgressService;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Contracts of the personal library: where playback stopped, and who may see or
 * change it. These are the rules the player and the friends UI rely on.
 */
@SpringBootTest
@ActiveProfiles("test")
class LibraryContractTest {

    @Autowired
    private WatchProgressService progress;

    @Autowired
    private FriendshipService friends;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private WatchEventRepository watchEvents;

    private Long ann;
    private Long bob;
    private String bobEmail;

    @BeforeEach
    void createUsers() {
        ann = user("ann").getId();
        AppUser b = user("bob");
        bob = b.getId();
        bobEmail = b.getEmail();
    }

    /* ───────────────────────── watch progress ───────────────────────── */

    @Test
    void positionIsStoredPerEpisodeAndResumable() {
        progress.save(ann, heartbeat("frieren", 3, 872, 1440));

        WatchProgressDto slot = progress.find(ann, "frieren", 3).orElseThrow();
        assertThat(slot.positionSeconds()).isEqualTo(872);
        assertThat(slot.completed()).isFalse();
        // A different episode is a different slot, not an overwrite.
        assertThat(progress.find(ann, "frieren", 4)).isEmpty();
    }

    @Test
    void jitterBelowThreeSecondsDoesNotRewriteTheRow() {
        progress.save(ann, heartbeat("frieren", 1, 100, 1400));
        WatchProgressDto first = progress.find(ann, "frieren", 1).orElseThrow();

        progress.save(ann, heartbeat("frieren", 1, 101, 1400));

        // Same position and same timestamp: the write was collapsed, which is what
        // keeps a paused player from hammering the database.
        WatchProgressDto after = progress.find(ann, "frieren", 1).orElseThrow();
        assertThat(after.positionSeconds()).isEqualTo(100);
        assertThat(after.updatedAt()).isEqualTo(first.updatedAt());
    }

    @Test
    void nearTheEndCountsAsFinishedAndLeavesContinueWatching() {
        progress.save(ann, heartbeat("bebop", 1, 600, 1400));
        assertThat(progress.continueWatching(ann, 10)).hasSize(1);

        progress.save(ann, heartbeat("bebop", 1, 1385, 1400));

        assertThat(progress.find(ann, "bebop", 1).orElseThrow().completed()).isTrue();
        assertThat(progress.continueWatching(ann, 10)).isEmpty();
    }

    @Test
    void restartingAFinishedEpisodeReopensIt() {
        progress.save(ann, heartbeat("bebop", 2, 1390, 1400));
        assertThat(progress.find(ann, "bebop", 2).orElseThrow().completed()).isTrue();

        progress.save(ann, heartbeat("bebop", 2, 4, 1400));

        assertThat(progress.find(ann, "bebop", 2).orElseThrow().completed()).isFalse();
    }

    @Test
    void aFewSecondsInIsNotWorthResuming() {
        progress.save(ann, heartbeat("gintama", 1, 6, 1400));

        // Stored, but deliberately not offered as "continue watching".
        assertThat(progress.find(ann, "gintama", 1)).isPresent();
        assertThat(progress.continueWatching(ann, 10)).isEmpty();
    }

    @Test
    void progressIsPrivateToItsOwner() {
        progress.save(ann, heartbeat("frieren", 3, 500, 1400));

        assertThat(progress.find(bob, "frieren", 3)).isEmpty();
        assertThat(progress.continueWatching(bob, 10)).isEmpty();
    }

    /* ───────────────────────── friendships ───────────────────────── */

    @Test
    void requestIsVisibleToTheAddresseeAndOnlyTheyCanAccept() {
        friends.request(ann, bobEmail);

        assertThat(friends.outgoing(ann)).hasSize(1);
        Long friendshipId = friends.incoming(bob).getFirst().friendshipId();

        assertThatThrownBy(() -> friends.respond(ann, friendshipId, true))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "not_allowed");

        friends.respond(bob, friendshipId, true);
        assertThat(friends.friends(ann)).hasSize(1);
        assertThat(friends.friends(bob)).hasSize(1);
    }

    @Test
    void oneEdgePerPairNoMatterWhoAsks() {
        friends.request(ann, bobEmail);

        assertThatThrownBy(() -> friends.request(ann, bobEmail))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "already_requested");

        // The other side asking back is an accept, not a second row.
        friends.request(bob, users.findById(ann).orElseThrow().getEmail());
        assertThat(friends.friends(ann)).hasSize(1);
        assertThat(friends.outgoing(bob)).isEmpty();
    }

    @Test
    void feedShowsOnlyAcceptedFriendsLatestEpisodePerTitle() {
        watch(bob, "frieren", 3, 300);
        watch(bob, "frieren", 4, 200);
        watch(bob, "bebop", 1, 100);

        // A pending request reveals nothing.
        friends.request(ann, bobEmail);
        assertThat(friends.feed(ann)).isEmpty();

        friends.respond(bob, friends.incoming(bob).getFirst().friendshipId(), true);
        assertThat(friends.feed(ann))
                .extracting(a -> a.animeKey() + "#" + a.episode())
                .containsExactly("bebop#1", "frieren#4");
        // Your own viewing is not in your friends feed.
        assertThat(friends.feed(bob)).isEmpty();
    }

    private void watch(Long userId, String animeKey, int episode, long secondsAgo) {
        watchEvents.save(WatchEvent.builder()
                .userId(userId)
                .animeKey(animeKey)
                .animeTitle(animeKey)
                .episode(episode)
                .watchedAt(Instant.now().minusSeconds(secondsAgo))
                .build());
    }

    @Test
    void unknownAddressAndSelfLookIdenticalToTheCaller() {
        ApiException unknown =
                catchApi(() -> friends.request(ann, "nobody-here@example.com"));
        ApiException self =
                catchApi(() -> friends.request(ann, users.findById(ann).orElseThrow().getEmail()));

        // Same code and same wording: this endpoint must not be a user-enumeration oracle.
        assertThat(unknown.getCode()).isEqualTo(self.getCode()).isEqualTo("request_failed");
        assertThat(unknown.getMessage()).isEqualTo(self.getMessage());
    }

    @Test
    void blockingPreventsTheOtherSideFromReopeningTheEdge() {
        friends.block(ann, bob);

        assertThatThrownBy(() -> friends.request(bob, users.findById(ann).orElseThrow().getEmail()))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "request_failed");
        // Only the blocker may clear it.
        assertThatThrownBy(() -> friends.remove(bob, ann))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "not_allowed");
        friends.remove(ann, bob);
        assertThat(friends.friends(ann)).isEmpty();
    }

    private static ApiException catchApi(Runnable action) {
        try {
            action.run();
            throw new AssertionError("expected an ApiException");
        } catch (ApiException e) {
            return e;
        }
    }

    private AppUser user(String name) {
        return users.save(AppUser.builder()
                .email(name + "-" + System.nanoTime() + "@example.com")
                .passwordHash("x")
                .displayName(name)
                .role(Role.USER)
                .emailVerified(true)
                .build());
    }

    private static WatchProgressRequest heartbeat(
            String key, int episode, int position, int duration) {
        return new WatchProgressRequest(key, "Title", episode, position, duration, "AniLiberty");
    }
}
