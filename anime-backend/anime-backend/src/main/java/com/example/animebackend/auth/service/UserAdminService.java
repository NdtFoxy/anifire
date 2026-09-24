package com.example.animebackend.auth.service;

import com.example.animebackend.auth.dto.AdminUserDetail;
import com.example.animebackend.auth.dto.AdminUserRow;
import com.example.animebackend.auth.dto.AdminUserUpdateRequest;
import com.example.animebackend.auth.dto.UserDto;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.repository.RefreshTokenRepository;
import com.example.animebackend.auth.repository.SocialIdentityRepository;
import com.example.animebackend.repository.AnimeRatingRepository;
import com.example.animebackend.repository.BookmarkRepository;
import com.example.animebackend.repository.CommentRepository;
import com.example.animebackend.repository.FriendshipRepository;
import com.example.animebackend.repository.WatchEventRepository;
import com.example.animebackend.repository.WatchProgressRepository;
import com.example.animebackend.service.RatingService;
import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.billing.service.Entitlement;
import com.example.animebackend.billing.service.EntitlementService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAdminService {

    private final AppUserRepository userRepository;
    private final EntitlementService entitlements;
    private final CommentRepository comments;
    private final WatchEventRepository watchEvents;
    private final WatchProgressRepository progress;
    private final BookmarkRepository bookmarks;
    private final FriendshipRepository friendships;
    private final RefreshTokenRepository refreshTokens;
    private final SocialIdentityRepository socialIdentities;
    private final RatingService ratingService;
    private final AnimeRatingRepository animeRatings;

    public UserAdminService(
            AppUserRepository userRepository,
            EntitlementService entitlements,
            CommentRepository comments,
            WatchEventRepository watchEvents,
            WatchProgressRepository progress,
            BookmarkRepository bookmarks,
            FriendshipRepository friendships,
            RefreshTokenRepository refreshTokens,
            SocialIdentityRepository socialIdentities,
            RatingService ratingService,
            AnimeRatingRepository animeRatings) {
        this.userRepository = userRepository;
        this.entitlements = entitlements;
        this.comments = comments;
        this.watchEvents = watchEvents;
        this.progress = progress;
        this.bookmarks = bookmarks;
        this.friendships = friendships;
        this.refreshTokens = refreshTokens;
        this.socialIdentities = socialIdentities;
        this.ratingService = ratingService;
        this.animeRatings = animeRatings;
    }

    @Transactional(readOnly = true)
    public List<UserDto> list() {
        List<AppUser> users = userRepository.findAllByIsDeletedFalseOrderByCreatedAtDesc();
        Map<Long, Entitlement> byUser =
                entitlements.forUsers(users.stream().map(AppUser::getId).toList());
        return users.stream()
                .map(u -> UserDto.from(u, byUser.getOrDefault(u.getId(), Entitlement.NONE)))
                .toList();
    }

    @Transactional
    public UserDto update(Long id, AdminUserUpdateRequest request) {
        AppUser user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.badRequest("user_not_found", "User not found."));

        if (request.displayName() != null) {
            user.setDisplayName(request.displayName().trim());
        }
        if (request.email() != null && !request.email().isBlank()) {
            user.setEmail(request.email().trim().toLowerCase(Locale.ROOT));
        }
        if (request.role() != null) {
            user.setRole(request.role());
        }
        if (request.emailVerified() != null) {
            user.setEmailVerified(request.emailVerified());
        }
        if (request.deleted() != null) {
            user.setDeleted(request.deleted());
        }
        AppUser saved = userRepository.save(user);
        return UserDto.from(saved, entitlements.forUser(saved.getId()));
    }

    /* ═══════════════ directory search ═══════════════ */

    /**
     * One page of the user directory.
     *
     * <p>Filtering and paging happen in the database, not in the browser: a console
     * that loads every account "because there are only a few" stops working the day
     * there are fifty thousand. Comment counts and view counts for the page are
     * fetched in two grouped queries rather than per row, so the cost stays flat as
     * the page size grows.
     */
    @Transactional(readOnly = true)
    public Page<AdminUserRow> search(
            String query,
            String commentText,
            Role role,
            Boolean verified,
            boolean includeDeleted,
            Pageable pageable) {
        Page<AppUser> page = userRepository.search(
                blankToNull(query),
                blankToNull(commentText),
                role,
                verified,
                includeDeleted,
                pageable);
        List<Long> ids = page.getContent().stream().map(AppUser::getId).toList();
        Map<Long, Long> commentCounts = ids.isEmpty() ? Map.of() : toCountMap(comments.countByCreators(ids));
        Map<Long, Long> viewCounts = ids.isEmpty() ? Map.of() : toCountMap(watchEvents.countByViewers(ids));
        Map<Long, Entitlement> plans = entitlements.forUsers(ids);
        Instant now = Instant.now();

        return page.map(user -> {
            Entitlement plan = plans.getOrDefault(user.getId(), Entitlement.NONE);
            return new AdminUserRow(
                    user.getId(),
                    user.getEmail(),
                    user.getDisplayName(),
                    user.getRole().name(),
                    user.isEmailVerified(),
                    user.isDeleted(),
                    user.getLockedUntil() != null && user.getLockedUntil().isAfter(now),
                    plan.adsFree(),
                    plan.plan() == null ? null : plan.plan().name(),
                    user.getSignupCountry(),
                    commentCounts.getOrDefault(user.getId(), 0L),
                    viewCounts.getOrDefault(user.getId(), 0L),
                    user.getLastLoginAt(),
                    user.getCreatedAt());
        });
    }

    /** Full dossier for one account. */
    @Transactional(readOnly = true)
    public AdminUserDetail detail(Long id) {
        AppUser user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.badRequest("user_not_found", "User not found."));
        Instant now = Instant.now();
        Entitlement plan = entitlements.forUser(id);

        Instant firstWatch = watchEvents.firstWatchFor(id);
        Instant lastWatch = watchEvents.lastWatchFor(id);
        Instant lastActivity = latest(lastWatch, user.getLastLoginAt(), user.getUpdatedAt());

        List<AdminUserDetail.CommentPreview> recentComments =
                comments.findByCreatorUserIdAndIsDeletedFalseOrderByCreationDateDesc(id, PageRequest.of(0, 10))
                        .stream()
                        .map(c -> new AdminUserDetail.CommentPreview(
                                c.getId(),
                                c.getAnime() == null ? null : c.getAnime().getId(),
                                c.getAnime() == null ? null : c.getAnime().getTitle(),
                                c.getDescription(),
                                c.getCreationDate() == null
                                        ? null
                                        : c.getCreationDate().toInstant(java.time.ZoneOffset.UTC)))
                        .toList();

        List<AdminUserDetail.WatchPreview> recentWatches =
                watchEvents.findTop10ByUserIdOrderByWatchedAtDesc(id).stream()
                        .map(w -> new AdminUserDetail.WatchPreview(
                                w.getAnimeKey(), w.getAnimeTitle(), w.getEpisode(), w.getWatchedAt()))
                        .toList();

        List<AdminUserDetail.SessionInfo> sessions =
                refreshTokens.findTop5ByUserIdAndRevokedFalseOrderByCreatedAtDesc(id).stream()
                        .map(s -> new AdminUserDetail.SessionInfo(
                                s.getUserAgent(), s.getIpAddress(), s.getCreatedAt(), s.getExpiresAt()))
                        .toList();

        List<AdminUserDetail.LinkedAccount> linked =
                socialIdentities.findByUserId(id).stream()
                        .map(s -> new AdminUserDetail.LinkedAccount(
                                s.getProvider(), s.getCreatedAt(), s.getLastLoginAt()))
                        .toList();

        return new AdminUserDetail(
                new AdminUserDetail.Profile(
                        user.getId(),
                        user.getEmail(),
                        user.getDisplayName(),
                        user.getRole().name(),
                        user.getBio(),
                        user.getLocation(),
                        user.getBirthday(),
                        user.getAvatarUrl(),
                        user.getSignupCountry(),
                        user.getLevel(),
                        user.getPoints(),
                        user.isDeleted()),
                new AdminUserDetail.Timeline(
                        user.getCreatedAt(),
                        user.getUpdatedAt(),
                        user.getPasswordChangedAt(),
                        user.getLastLoginAt(),
                        firstWatch,
                        lastActivity),
                new AdminUserDetail.Security(
                        user.isEmailVerified(),
                        user.getLockedUntil() != null && user.getLockedUntil().isAfter(now),
                        user.getLockedUntil(),
                        user.getFailedAttempts(),
                        refreshTokens.countByUserIdAndRevokedFalseAndExpiresAtAfter(id, now),
                        user.getPasswordChangedAt() != null
                                && user.getCreatedAt() != null
                                && !user.getPasswordChangedAt().isAfter(user.getCreatedAt().plusSeconds(5))),
                new AdminUserDetail.Engagement(
                        comments.countByCreatorUserIdAndIsDeletedFalse(id),
                        watchEvents.countByUserId(id),
                        watchEvents.countDistinctTitlesForUser(id),
                        progress.watchedSecondsFor(id),
                        progress.countByUserIdAndCompletedTrue(id),
                        bookmarks.countByUserId(id),
                        friendships.countAcceptedFor(id),
                        animeRatings.countByUserId(id),
                        animeRatings.averageForUser(id),
                        plan.adsFree(),
                        plan.plan() == null ? null : plan.plan().name(),
                        plan.premiumUntil()),
                recentComments,
                recentWatches,
                sessions,
                linked,
                ratingService.forUser(id).stream()
                        .map(r -> new AdminUserDetail.RatingEntry(
                                r.animeId(), r.title(), r.imageUrl(), r.score(), r.review(), r.updatedAt()))
                        .toList());
    }

    private static Map<Long, Long> toCountMap(List<Object[]> rows) {
        Map<Long, Long> out = new java.util.HashMap<>();
        for (Object[] row : rows) {
            out.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        return out;
    }

    private static Instant latest(Instant... values) {
        Instant best = null;
        for (Instant value : values) {
            if (value != null && (best == null || value.isAfter(best))) best = value;
        }
        return best;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
