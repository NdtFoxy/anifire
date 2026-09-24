package com.example.animebackend.party;

import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.web.ApiException;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Duration;
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
 * Rooms live in memory. That is a deliberate limit, not an oversight: a party
 * is ephemeral (nobody expects it to survive a deploy) and the production stack
 * runs a single API instance. Scaling out would move rooms and fan-out to Redis
 * pub/sub behind this same interface.
 *
 * The room holds the authoritative playback state as (position, playing, at):
 * clients extrapolate the current second from it, so a late joiner lands where
 * everyone else is instead of where the last event happened.
 */
@Service
public class PartyService {

    private static final Logger log = LoggerFactory.getLogger(PartyService.class);

    static final int MAX_MEMBERS = 20;
    static final int MAX_ROOMS_PER_HOST = 3;
    static final Duration IDLE_TTL = Duration.ofHours(6);
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

    private static final class Room {
        final String code;
        final Long hostId;
        String animeKey;
        int episode;
        boolean playing;
        double position;
        Instant at = Instant.now();
        Long by;
        Instant touched = Instant.now();
        final Map<Long, String> members = new LinkedHashMap<>();
        final List<Subscriber> subscribers = new CopyOnWriteArrayList<>();

        Room(String code, Long hostId, String animeKey, int episode) {
            this.code = code;
            this.hostId = hostId;
            this.animeKey = animeKey;
            this.episode = episode;
        }
    }

    private record Subscriber(Long userId, SseEmitter emitter) {}

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final AppUserRepository users;

    public PartyService(AppUserRepository users) {
        this.users = users;
    }

    public State create(Long hostId, String animeKey, int episode, double position) {
        long owned = rooms.values().stream().filter(r -> r.hostId.equals(hostId)).count();
        if (owned >= MAX_ROOMS_PER_HOST) {
            throw ApiException.tooManyRequests("Слишком много комнат. Закройте старые или подождите.");
        }
        String code;
        do {
            code = randomCode();
        } while (rooms.containsKey(code));
        Room room = new Room(code, hostId, animeKey, Math.max(1, episode));
        room.position = Math.max(0, position);
        room.members.put(hostId, displayName(hostId));
        rooms.put(code, room);
        synchronized (room) {
            return snapshot(room);
        }
    }

    public State join(String code, Long userId) {
        Room room = room(code);
        synchronized (room) {
            if (!room.members.containsKey(userId) && room.members.size() >= MAX_MEMBERS) {
                throw ApiException.badRequest("party_full", "В комнате уже " + MAX_MEMBERS + " человек.");
            }
            room.members.putIfAbsent(userId, displayName(userId));
            room.touched = Instant.now();
            State state = snapshot(room);
            broadcast(room, state);
            return state;
        }
    }

    public State update(String code, Long userId, boolean playing, double position, int episode, String animeKey) {
        Room room = room(code);
        synchronized (room) {
            requireMember(room, userId);
            room.playing = playing;
            room.position = Math.max(0, position);
            room.episode = Math.max(1, episode);
            if (animeKey != null && !animeKey.isBlank()) room.animeKey = animeKey;
            room.at = Instant.now();
            room.by = userId;
            room.touched = room.at;
            State state = snapshot(room);
            broadcast(room, state);
            return state;
        }
    }

    public void leave(String code, Long userId) {
        Room room = rooms.get(code);
        if (room == null) return;
        synchronized (room) {
            room.members.remove(userId);
            room.subscribers.removeIf(s -> s.userId().equals(userId));
            if (room.members.isEmpty()) {
                rooms.remove(code);
                return;
            }
            broadcast(room, snapshot(room));
        }
    }

    public SseEmitter subscribe(String code, Long userId) {
        Room room = room(code);
        // No server-side timeout: the client reconnects, and the reaper below
        // closes emitters of rooms that went idle.
        SseEmitter emitter = new SseEmitter(0L);
        Subscriber sub = new Subscriber(userId, emitter);
        synchronized (room) {
            requireMember(room, userId);
            room.subscribers.add(sub);
            send(room, sub, snapshot(room));
        }
        Runnable drop = () -> room.subscribers.remove(sub);
        emitter.onCompletion(drop);
        emitter.onTimeout(drop);
        emitter.onError(e -> drop.run());
        return emitter;
    }

    /** Keeps proxies from closing quiet streams and drops rooms nobody touched for hours. */
    @Scheduled(fixedDelay = 25_000)
    void heartbeatAndReap() {
        Instant cutoff = Instant.now().minus(IDLE_TTL);
        rooms.values().removeIf(room -> {
            if (room.touched.isBefore(cutoff)) {
                room.subscribers.forEach(s -> s.emitter().complete());
                return true;
            }
            for (Subscriber s : room.subscribers) {
                try {
                    s.emitter().send(SseEmitter.event().comment("ping"));
                } catch (IOException | IllegalStateException e) {
                    room.subscribers.remove(s);
                }
            }
            return false;
        });
    }

    private void broadcast(Room room, State state) {
        for (Subscriber s : room.subscribers) send(room, s, state);
    }

    private void send(Room room, Subscriber s, State state) {
        try {
            s.emitter().send(SseEmitter.event().name("state").data(state));
        } catch (IOException | IllegalStateException e) {
            room.subscribers.remove(s);
            log.debug("Dropped party subscriber {} in {}: {}", s.userId(), room.code, e.toString());
        }
    }

    private Room room(String code) {
        Room room = code == null ? null : rooms.get(code);
        if (room == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "party_not_found", "Комната не найдена или уже закрыта.");
        }
        return room;
    }

    private static void requireMember(Room room, Long userId) {
        if (!room.members.containsKey(userId)) {
            throw ApiException.forbidden("not_a_member", "Сначала присоединитесь к комнате.");
        }
    }

    private State snapshot(Room room) {
        List<Member> members = new ArrayList<>();
        room.members.forEach((id, name) -> members.add(new Member(id, name)));
        return new State(room.code, room.animeKey, room.episode, room.hostId, List.copyOf(members),
                room.playing, room.position, room.at, room.by, Instant.now());
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
