package com.example.animebackend.service;

import com.example.animebackend.dto.WatchProgressDto;
import com.example.animebackend.dto.WatchProgressRequest;
import com.example.animebackend.entity.WatchProgress;
import com.example.animebackend.repository.WatchProgressRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps the resume position for every (user, title, episode) slot.
 *
 * <p>The player sends a heartbeat every few seconds, so this is a write-heavy
 * path and it is shaped for that:
 * <ul>
 *   <li>One mutable row per slot, upserted — the log of "what was watched" stays
 *       in {@code watch_events}, so this table never grows with playback time.</li>
 *   <li>Writes that move the position less than {@link #MIN_DELTA_SECONDS} are
 *       dropped unless something else changed, which collapses the jitter of a
 *       paused player into no database traffic at all.</li>
 *   <li>A position within {@link #COMPLETE_TAIL_SECONDS} of the end (or past
 *       {@link #COMPLETE_RATIO} of it) marks the episode finished, which is what
 *       takes it out of "continue watching" instead of parking it at 99%.</li>
 *   <li>A finished episode restarted from the beginning clears the flag, so a
 *       rewatch behaves like a fresh one.</li>
 * </ul>
 */
@Service
public class WatchProgressService {

    private static final int MIN_DELTA_SECONDS = 3;
    private static final int COMPLETE_TAIL_SECONDS = 30;
    private static final double COMPLETE_RATIO = 0.92;
    /** Below this a "resume" is noise — starting over is friendlier. */
    private static final int RESUME_FLOOR_SECONDS = 10;
    private static final int MAX_FEED = 50;

    private final WatchProgressRepository repo;

    public WatchProgressService(WatchProgressRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public WatchProgressDto save(Long userId, WatchProgressRequest req) {
        String key = req.animeKey().trim();
        WatchProgress row =
                repo.findByUserIdAndAnimeKeyAndEpisode(userId, key, req.episode())
                        .orElseGet(() -> WatchProgress.builder()
                                .userId(userId)
                                .animeKey(key)
                                .episode(req.episode())
                                .positionSeconds(0)
                                .build());

        Integer duration = req.durationSeconds() != null && req.durationSeconds() > 0
                ? req.durationSeconds()
                : row.getDurationSeconds();
        boolean completed = isComplete(req.positionSeconds(), duration);
        // Restarting a finished episode reopens it.
        if (row.isCompleted() && !completed && req.positionSeconds() < RESUME_FLOOR_SECONDS) {
            row.setCompleted(false);
        }

        boolean moved = Math.abs(req.positionSeconds() - row.getPositionSeconds()) >= MIN_DELTA_SECONDS;
        boolean stateChanged =
                completed != row.isCompleted()
                        || !java.util.Objects.equals(duration, row.getDurationSeconds())
                        || row.getId() == null;
        if (!moved && !stateChanged) {
            return WatchProgressDto.from(row);
        }

        row.setPositionSeconds(req.positionSeconds());
        row.setDurationSeconds(duration);
        if (completed) {
            row.setCompleted(true);
        }
        if (req.animeTitle() != null && !req.animeTitle().isBlank()) {
            row.setAnimeTitle(req.animeTitle().trim());
        }
        if (req.provider() != null && !req.provider().isBlank()) {
            row.setProvider(req.provider().trim());
        }
        row.setUpdatedAt(Instant.now());
        return WatchProgressDto.from(repo.save(row));
    }

    @Transactional(readOnly = true)
    public Optional<WatchProgressDto> find(Long userId, String animeKey, int episode) {
        return repo.findByUserIdAndAnimeKeyAndEpisode(userId, animeKey, episode)
                .map(WatchProgressDto::from);
    }

    @Transactional(readOnly = true)
    public List<WatchProgressDto> continueWatching(Long userId, int limit) {
        return repo.findByUserIdAndCompletedFalseOrderByUpdatedAtDesc(
                        userId, PageRequest.of(0, Math.clamp(limit, 1, MAX_FEED)))
                .stream()
                .filter(p -> p.getPositionSeconds() >= RESUME_FLOOR_SECONDS)
                .map(WatchProgressDto::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<WatchProgressDto> forTitle(Long userId, String animeKey) {
        return repo.findByUserIdAndAnimeKeyOrderByEpisodeAsc(userId, animeKey).stream()
                .map(WatchProgressDto::from)
                .toList();
    }

    private static boolean isComplete(int position, Integer duration) {
        if (duration == null || duration <= 0) return false;
        return position >= duration - COMPLETE_TAIL_SECONDS || position >= duration * COMPLETE_RATIO;
    }
}
