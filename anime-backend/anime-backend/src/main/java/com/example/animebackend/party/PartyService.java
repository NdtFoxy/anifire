package com.example.animebackend.party;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.web.ApiException;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Watch parties: shared play/pause/seek state for one episode, fanned out to
 * every member over server-sent events.
 *
 * Room state lives in a {@link PartyStore} (Redis in dev and production), so any
 * API instance can serve any member; this class only holds the SSE connections
 * opened against this instance and relays store announcements to them.
 *
 * The room keeps playback as (position, playing, at): clients extrapolate the
 * current second from it, so a late joiner lands where everyone else is instead
 * of where the last event happened.
 */
@Service
public class PartyService {

    private static final Logger log = LoggerFactory.getLogger(PartyService.class);

    static final int MAX_MEMBERS = 20;
    static final int MAX_ROOMS_PER_HOST = 3;
    private static final char[] ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Member(Long userId, String displayName) {}

    public record State(
            String code,
            String animeKey,
            int episode,
            Long hostId,
            List<Member> members,
            boolean playing,
            double position,
            Instant at,
            /** Who caused this state; clients ignore echoes of their own changes. */
            Long by,
            Instant serverTime) {}

    private record Subscriber(Long userId, SseEmitter emitter) {}

    private final PartyStore store;
    private final AppUserRepository users;
    private final Map<String, List<Subscriber>> local = new ConcurrentHashMap<>();

    public PartyService(PartyStore store, AppUserRepository users) {
        this.store = store;
        this.users = users;
        store.onChange(this::relay);
    }

    public State create(Long hostId, String animeKey, int episode, double position) {
        if (store.roomsHostedBy(hostId) >= MAX_ROOMS_PER_HOST) {
            throw ApiException.tooManyRequests("Слишком много комнат. Закройте старые или подождите.");
        }
        LinkedHashMap<Long, String> members = new LinkedHashMap<>();
        members.put(hostId, displayName(hostId));
        for (int attempt = 0; attempt < 5; attempt++) {
            PartyStore.Room room = new PartyStore.Room(randomCode(), hostId, animeKey, Math.max(1, episode),
                    false, Math.max(0, position), Instant.now(), null, members);
            if (store.create(room)) return snapshot(room);
        }
        throw new IllegalStateException("Could not allocate a party code");
    }

    public State join(String code, Long userId) {
        PartyStore.Room before = room(code);
        if (!before.members().containsKey(userId) && before.members().size() >= MAX_MEMBERS) {
            throw ApiException.badRequest("party_full", "В комнате уже " + MAX_MEMBERS + " человек.");
        }
        PartyStore.Room room = store.addMember(code, userId, displayName(userId), MAX_MEMBERS)
                .orElseThrow(PartyService::notFound);
        if (!room.members().containsKey(userId)) {
            throw ApiException.badRequest("party_full", "В комнате уже " + MAX_MEMBERS + " человек.");
        }
        store.publish(room);
        return snapshot(room);
    }

    public State update(String code, Long userId, boolean playing, double position, int episode, String animeKey) {
        requireMember(room(code), userId);
        PartyStore.Room room = store.updatePlayback(code, playing, Math.max(0, position), Math.max(1, episode),
                        animeKey == null || animeKey.isBlank() ? null : animeKey, userId)
                .orElseThrow(PartyService::notFound);
        store.publish(room);
        return snapshot(room);
    }

    public void leave(String code, Long userId) {
        List<Subscriber> subs = local.get(code);
        if (subs != null) subs.removeIf(s -> s.userId().equals(userId));
        store.removeMember(code, userId).ifPresent(store::publish);
    }

    public SseEmitter subscribe(String code, Long userId) {
        PartyStore.Room room = room(code);
        requireMember(room, userId);
        // No server-side timeout: the client reconnects, and the heartbeat below
        // closes streams of rooms that expired.
        SseEmitter emitter = new SseEmitter(0L);
        Subscriber sub = new Subscriber(userId, emitter);
        List<Subscriber> subs = local.computeIfAbsent(code, k -> new CopyOnWriteArrayList<>());
        subs.add(sub);
        send(code, sub, snapshot(room));
        Runnable drop = () -> subs.remove(sub);
        emitter.onCompletion(drop);
        emitter.onTimeout(drop);
        emitter.onError(e -> drop.run());
        return emitter;
    }

    /** A change announced by any instance: push it to the streams held here. */
    private void relay(PartyStore.Room room) {
        List<Subscriber> subs = local.get(room.code());
        if (subs == null || subs.isEmpty()) return;
        State state = snapshot(room);
        for (Subscriber s : subs) send(room.code(), s, state);
    }

    /** Keeps proxies from closing quiet streams and ends streams of rooms that expired. */
    @Scheduled(fixedDelay = 25_000)
    void heartbeat() {
        for (Map.Entry<String, List<Subscriber>> e : local.entrySet()) {
            if (e.getValue().isEmpty() || store.get(e.getKey()).isEmpty()) {
                e.getValue().forEach(s -> s.emitter().complete());
                local.remove(e.getKey());
                continue;
            }
            for (Subscriber s : e.getValue()) {
                try {
                    s.emitter().send(SseEmitter.event().comment("ping"));
                } catch (IOException | IllegalStateException ex) {
                    e.getValue().remove(s);
                }
            }
        }
    }

    private void send(String code, Subscriber s, State state) {
        try {
            s.emitter().send(SseEmitter.event().name("state").data(state));
        } catch (IOException | IllegalStateException e) {
            List<Subscriber> subs = local.get(code);
            if (subs != null) subs.remove(s);
            log.debug("Dropped party subscriber {} in {}: {}", s.userId(), code, e.toString());
        }
    }

    private PartyStore.Room room(String code) {
        return (code == null ? java.util.Optional.<PartyStore.Room>empty() : store.get(code))
                .orElseThrow(PartyService::notFound);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "party_not_found", "Комната не найдена или уже закрыта.");
    }

    private static void requireMember(PartyStore.Room room, Long userId) {
        if (!room.members().containsKey(userId)) {
            throw ApiException.forbidden("not_a_member", "Сначала присоединитесь к комнате.");
        }
    }

    private static State snapshot(PartyStore.Room room) {
        List<Member> members = new ArrayList<>();
        room.members().forEach((id, name) -> members.add(new Member(id, name)));
        return new State(room.code(), room.animeKey(), room.episode(), room.hostId(), List.copyOf(members),
                room.playing(), room.position(), room.at(), room.by(), Instant.now());
    }

    private String displayName(Long userId) {
        return users.findById(userId).map(AppUser::getDisplayName).filter(n -> n != null && !n.isBlank())
                .orElse("Зритель");
    }

    private static String randomCode() {
        char[] out = new char[10];
        for (int i = 0; i < out.length; i++) out[i] = ALPHABET[RANDOM.nextInt(ALPHABET.length)];
        return new String(out);
    }
}
