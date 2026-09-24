package com.example.animebackend.service;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.security.RateLimiterService;
import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.dto.FriendDto;
import com.example.animebackend.entity.Friendship;
import com.example.animebackend.entity.Friendship.Status;
import com.example.animebackend.repository.FriendshipRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Friend requests, acceptance and blocking.
 *
 * <p>Abuse controls are part of the model, not an afterthought:
 * <ul>
 *   <li>One edge per pair (DB-enforced), so spamming requests cannot create a
 *       thousand rows between two accounts.</li>
 *   <li>A capped number of outstanding outgoing requests plus a per-user rate
 *       limit — a friend list is otherwise a broadcast channel.</li>
 *   <li>A declined request has a cool-off before it can be sent again, so "no"
 *       cannot be re-asked in a loop.</li>
 *   <li>A block is terminal: the blocked side cannot re-open the edge, and only
 *       the blocker can clear it.</li>
 *   <li>Lookup is by exact email and never reports whether an address exists —
 *       otherwise this endpoint becomes a user-enumeration oracle.</li>
 * </ul>
 */
@Service
public class FriendshipService {

    private static final long MAX_PENDING_OUTGOING = 50;
    private static final Duration DECLINE_COOLDOWN = Duration.ofHours(24);

    private final FriendshipRepository friendships;
    private final AppUserRepository users;
    private final RateLimiterService rateLimiter;

    public FriendshipService(
            FriendshipRepository friendships,
            AppUserRepository users,
            RateLimiterService rateLimiter) {
        this.friendships = friendships;
        this.users = users;
        this.rateLimiter = rateLimiter;
    }

    @Transactional
    public FriendDto request(Long requesterId, String rawEmail) {
        if (!rateLimiter.allow("friend-req:" + requesterId, 30, Duration.ofHours(1))) {
            throw ApiException.tooManyRequests("Слишком много заявок в друзья. Попробуйте позже.");
        }
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
        AppUser target = users.findByEmailAndIsDeletedFalse(email).orElse(null);

        // Deliberately identical failure for "no such user" and "cannot add".
        if (target == null || target.getId().equals(requesterId)) {
            throw ApiException.badRequest(
                    "request_failed", "Не удалось отправить заявку. Проверьте адрес.");
        }
        if (friendships.countByRequesterIdAndStatus(requesterId, Status.PENDING) >= MAX_PENDING_OUTGOING) {
            throw ApiException.badRequest(
                    "too_many_pending", "Слишком много заявок без ответа. Дождитесь ответов.");
        }

        Friendship existing = friendships.findEdge(requesterId, target.getId()).orElse(null);
        if (existing != null) {
            switch (existing.getStatus()) {
                case ACCEPTED -> throw ApiException.badRequest("already_friends", "Вы уже друзья.");
                case BLOCKED -> throw ApiException.badRequest(
                        "request_failed", "Не удалось отправить заявку. Проверьте адрес.");
                case PENDING -> {
                    // The other side already asked: treat this as an accept.
                    if (existing.getAddresseeId().equals(requesterId)) {
                        return respond(requesterId, existing.getId(), true);
                    }
                    throw ApiException.badRequest("already_requested", "Заявка уже отправлена.");
                }
                case DECLINED -> {
                    Instant when = existing.getRespondedAt() == null
                            ? existing.getCreatedAt()
                            : existing.getRespondedAt();
                    if (when.plus(DECLINE_COOLDOWN).isAfter(Instant.now())) {
                        throw ApiException.badRequest(
                                "request_failed", "Не удалось отправить заявку. Проверьте адрес.");
                    }
                    existing.setRequesterId(requesterId);
                    existing.setAddresseeId(target.getId());
                    existing.setStatus(Status.PENDING);
                    existing.setRespondedAt(null);
                    return toDto(friendships.save(existing), requesterId, target);
                }
            }
        }

        Friendship saved = friendships.save(Friendship.builder()
                .requesterId(requesterId)
                .addresseeId(target.getId())
                .status(Status.PENDING)
                .build());
        return toDto(saved, requesterId, target);
    }

    @Transactional
    public FriendDto respond(Long userId, Long friendshipId, boolean accept) {
        Friendship edge = load(friendshipId);
        // Only the person who received the request may answer it.
        if (!edge.getAddresseeId().equals(userId) || edge.getStatus() != Status.PENDING) {
            throw ApiException.forbidden("not_allowed", "Эта заявка адресована не вам.");
        }
        edge.setStatus(accept ? Status.ACCEPTED : Status.DECLINED);
        edge.setRespondedAt(Instant.now());
        Friendship saved = friendships.save(edge);
        return toDto(saved, userId, users.findById(saved.getRequesterId()).orElse(null));
    }

    @Transactional
    public void remove(Long userId, Long otherUserId) {
        Friendship edge = friendships.findEdge(userId, otherUserId)
                .orElseThrow(() -> ApiException.badRequest("not_found", "Вы не связаны."));
        if (edge.getStatus() == Status.BLOCKED && !edge.getRequesterId().equals(userId)) {
            // Only the blocker can lift a block.
            throw ApiException.forbidden("not_allowed", "Эту связь нельзя изменить.");
        }
        friendships.delete(edge);
    }

    @Transactional
    public void block(Long userId, Long otherUserId) {
        if (userId.equals(otherUserId)) {
            throw ApiException.badRequest("not_allowed", "Нельзя заблокировать себя.");
        }
        users.findById(otherUserId)
                .filter(u -> !u.isDeleted())
                .orElseThrow(() -> ApiException.badRequest("not_found", "Такого аккаунта нет."));
        Friendship edge = friendships.findEdge(userId, otherUserId).orElse(null);
        if (edge == null) {
            edge = Friendship.builder()
                    .requesterId(userId)
                    .addresseeId(otherUserId)
                    .status(Status.BLOCKED)
                    .build();
        } else {
            // The blocker becomes the requester so ownership of the block is explicit.
            edge.setRequesterId(userId);
            edge.setAddresseeId(otherUserId);
            edge.setStatus(Status.BLOCKED);
        }
        edge.setRespondedAt(Instant.now());
        friendships.save(edge);
    }

    @Transactional(readOnly = true)
    public List<FriendDto> friends(Long userId) {
        List<Friendship> edges = friendships.findAllForUser(userId, Status.ACCEPTED);
        return hydrate(edges, userId);
    }

    @Transactional(readOnly = true)
    public List<FriendDto> incoming(Long userId) {
        return hydrate(
                friendships.findByAddresseeIdAndStatusOrderByCreatedAtDesc(userId, Status.PENDING),
                userId);
    }

    @Transactional(readOnly = true)
    public List<FriendDto> outgoing(Long userId) {
        return hydrate(
                friendships.findByRequesterIdAndStatusOrderByCreatedAtDesc(userId, Status.PENDING),
                userId);
    }

    private List<FriendDto> hydrate(List<Friendship> edges, Long userId) {
        if (edges.isEmpty()) return List.of();
        List<Long> otherIds = edges.stream()
                .map(e -> e.getRequesterId().equals(userId) ? e.getAddresseeId() : e.getRequesterId())
                .distinct()
                .toList();
        Map<Long, AppUser> byId = users.findAllById(otherIds).stream()
                .collect(Collectors.toMap(AppUser::getId, Function.identity()));
        List<FriendDto> out = new ArrayList<>(edges.size());
        for (Friendship edge : edges) {
            Long otherId = edge.getRequesterId().equals(userId)
                    ? edge.getAddresseeId()
                    : edge.getRequesterId();
            out.add(toDto(edge, userId, byId.get(otherId)));
        }
        return out;
    }

    private FriendDto toDto(Friendship edge, Long userId, AppUser other) {
        boolean incoming = edge.getAddresseeId().equals(userId);
        return new FriendDto(
                edge.getId(),
                other == null ? null : other.getId(),
                other == null ? "Удалённый аккаунт" : other.getDisplayName(),
                other == null ? null : other.getAvatarUrl(),
                other == null ? 0 : other.getLevel(),
                edge.getStatus().name(),
                incoming,
                edge.getRespondedAt() == null ? edge.getCreatedAt() : edge.getRespondedAt());
    }

    private Friendship load(Long id) {
        return friendships.findById(id)
                .orElseThrow(() -> ApiException.badRequest("not_found", "Этой заявки больше нет."));
    }
}
