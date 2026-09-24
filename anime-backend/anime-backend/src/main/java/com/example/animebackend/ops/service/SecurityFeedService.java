package com.example.animebackend.ops.service;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.repository.RefreshTokenRepository;
import com.example.animebackend.geo.service.GeoAccessService;
import com.example.animebackend.ops.dto.SecuritySignal;
import com.example.animebackend.repository.AnimeRatingRepository;
import com.example.animebackend.repository.CommentRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns ordinary tables into a list of things that look wrong.
 *
 * <p>Every signal is a query over data the platform already records — nothing is
 * sampled, guessed or scored by a model. Each one states the evidence it is based
 * on, because an operator is about to act on it (suspend an account, delete
 * reviews) and needs to be able to check the claim.
 *
 * <p>Thresholds are intentionally conservative: a false accusation of review
 * farming is worse than a missed one, and the feed is a queue for human review,
 * not an automatic ban list.
 */
@Service
public class SecurityFeedService {

    /* ── thresholds, in one place so they can be argued about ── */
    private static final int RATING_BURST = 8;          // ratings within 24h by one account
    private static final int UNIFORM_RATING_MIN = 5;    // identical scores before it is a pattern
    private static final int COMMENT_FLOOD = 8;         // comments within 1h by one account
    private static final int DUPLICATE_COMMENT_MIN = 3; // same text repeated
    private static final int MANY_SESSIONS = 8;         // simultaneous live refresh tokens
    private static final int FAILED_ATTEMPTS_WATCH = 3;

    private final AnimeRatingRepository ratings;
    private final CommentRepository comments;
    private final AppUserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final GeoAccessService geo;

    public SecurityFeedService(
            AnimeRatingRepository ratings,
            CommentRepository comments,
            AppUserRepository users,
            RefreshTokenRepository refreshTokens,
            GeoAccessService geo) {
        this.ratings = ratings;
        this.comments = comments;
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.geo = geo;
    }

    @Transactional(readOnly = true)
    public List<SecuritySignal> signals() {
        Instant now = Instant.now();
        Instant dayAgo = now.minus(Duration.ofDays(1));
        Instant hourAgo = now.minus(Duration.ofHours(1));
        List<SecuritySignal> out = new ArrayList<>();

        // ── rating manipulation ──
        for (Object[] row : ratings.burstRaters(dayAgo, RATING_BURST)) {
            long userId = ((Number) row[0]).longValue();
            long count = ((Number) row[1]).longValue();
            out.add(new SecuritySignal(
                    "medium",
                    "rating_burst",
                    "Всплеск оценок",
                    label(userId),
                    "Оценок за последние 24 часа: " + count + " — намного больше обычного.",
                    userId,
                    count,
                    now));
        }
        for (Object[] row : ratings.uniformRaters(UNIFORM_RATING_MIN)) {
            long userId = ((Number) row[0]).longValue();
            long count = ((Number) row[1]).longValue();
            int score = ((Number) row[2]).intValue();
            out.add(new SecuritySignal(
                    "high",
                    "uniform_ratings",
                    "Одинаковые оценки",
                    label(userId),
                    "Все " + count + " оценок равны " + score
                            + " — похоже на накрутку, а не на мнение.",
                    userId,
                    count,
                    now));
        }

        // ── comment abuse ──
        // Comment.creationDate is a LocalDateTime in UTC, unlike the Instant columns
        // elsewhere; convert rather than change a table the whole catalogue reads.
        for (Object[] row :
                comments.floodAuthors(
                        java.time.LocalDateTime.ofInstant(hourAgo, java.time.ZoneOffset.UTC),
                        COMMENT_FLOOD)) {
            long userId = ((Number) row[0]).longValue();
            long count = ((Number) row[1]).longValue();
            out.add(new SecuritySignal(
                    "medium",
                    "comment_flood",
                    "Поток комментариев",
                    label(userId),
                    "Комментариев за час: " + count + ".",
                    userId,
                    count,
                    now));
        }
        for (Object[] row : comments.duplicateTexts(DUPLICATE_COMMENT_MIN)) {
            String text = String.valueOf(row[0]);
            long count = ((Number) row[1]).longValue();
            long authors = ((Number) row[2]).longValue();
            out.add(new SecuritySignal(
                    authors > 1 ? "high" : "medium",
                    "duplicate_comments",
                    authors > 1 ? "Согласованная копипаста" : "Повторяющийся комментарий",
                    authors > 1 ? "аккаунтов: " + authors : "один аккаунт",
                    "«" + shorten(text) + "» — опубликовано " + count + " раз.",
                    null,
                    count,
                    now));
        }

        // ── account security ──
        for (AppUser user : users.findByLockedUntilAfter(now)) {
            out.add(new SecuritySignal(
                    "high",
                    "account_locked",
                    "Аккаунт заблокирован",
                    user.getEmail(),
                    "Заблокирован до " + user.getLockedUntil() + " после серии неудачных входов.",
                    user.getId(),
                    1,
                    user.getLockedUntil()));
        }
        for (AppUser user : users.findByFailedAttemptsGreaterThanEqual(FAILED_ATTEMPTS_WATCH)) {
            if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(now)) continue;
            out.add(new SecuritySignal(
                    "medium",
                    "failed_logins",
                    "Подбор пароля",
                    user.getEmail(),
                    "Неудачных входов подряд: " + user.getFailedAttempts() + ".",
                    user.getId(),
                    user.getFailedAttempts(),
                    now));
        }
        for (Object[] row : refreshTokens.manySessions(now, MANY_SESSIONS)) {
            long userId = ((Number) row[0]).longValue();
            long count = ((Number) row[1]).longValue();
            out.add(new SecuritySignal(
                    "medium",
                    "many_sessions",
                    "Необычно много сессий",
                    label(userId),
                    "Активных сессий одновременно: " + count + " — общий пароль или украденный токен.",
                    userId,
                    count,
                    now));
        }

        // ── geo fence ──
        for (Map.Entry<String, Long> entry : geo.refusalsByCountry().entrySet()) {
            if (entry.getValue() < 5) continue;
            out.add(new SecuritySignal(
                    "low",
                    "geo_refusals",
                    "Трафик из заблокированного региона",
                    entry.getKey(),
                    "Отклонено запросов с последнего перезапуска: " + entry.getValue() + ".",
                    null,
                    entry.getValue(),
                    now));
        }

        out.sort(Comparator.comparingInt((SecuritySignal s) -> switch (s.severity()) {
            case "high" -> 0;
            case "medium" -> 1;
            default -> 2;
        }).thenComparing(SecuritySignal::count, Comparator.reverseOrder()));
        return out;
    }

    private String label(Long userId) {
        return users.findById(userId).map(AppUser::getEmail).orElse("аккаунт #" + userId);
    }

    private static String shorten(String text) {
        String clean = text == null ? "" : text.strip().replaceAll("\\s+", " ");
        return clean.length() > 60 ? clean.substring(0, 60) + "…" : clean;
    }
}
