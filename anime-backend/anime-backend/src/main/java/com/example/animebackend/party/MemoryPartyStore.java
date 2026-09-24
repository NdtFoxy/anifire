package com.example.animebackend.party;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Single-process rooms (tests, local runs without Redis). */
@Component
@ConditionalOnProperty(name = "anifire.party.store", havingValue = "memory")
public class MemoryPartyStore implements PartyStore {

    private record Entry(Room room, Instant touched) {}

    private final Map<String, Entry> rooms = new ConcurrentHashMap<>();
    private volatile Consumer<Room> handler = r -> {};

    @Override
    public boolean create(Room room) {
        return rooms.putIfAbsent(room.code(), new Entry(room, Instant.now())) == null;
    }

    @Override
    public Optional<Room> get(String code) {
        return Optional.ofNullable(rooms.get(code)).map(Entry::room);
    }

    @Override
    public Optional<Room> addMember(String code, Long userId, String displayName, int maxMembers) {
        Entry e = rooms.computeIfPresent(code, (k, cur) -> {
            if (!cur.room().members().containsKey(userId) && cur.room().members().size() >= maxMembers) return cur;
            LinkedHashMap<Long, String> members = new LinkedHashMap<>(cur.room().members());
            members.putIfAbsent(userId, displayName);
            return new Entry(withMembers(cur.room(), members), Instant.now());
        });
        return Optional.ofNullable(e).map(Entry::room);
    }

    @Override
    public Optional<Room> removeMember(String code, Long userId) {
        Entry e = rooms.computeIfPresent(code, (k, cur) -> {
            LinkedHashMap<Long, String> members = new LinkedHashMap<>(cur.room().members());
            members.remove(userId);
            return members.isEmpty() ? null : new Entry(withMembers(cur.room(), members), Instant.now());
        });
        return Optional.ofNullable(e).map(Entry::room);
    }

    @Override
    public Optional<Room> updatePlayback(
            String code, boolean playing, double position, int episode, String animeKey, Long by) {
        Entry e = rooms.computeIfPresent(code, (k, cur) -> {
            Room r = cur.room();
            return new Entry(new Room(r.code(), r.hostId(), animeKey == null ? r.animeKey() : animeKey, episode,
                    playing, position, Instant.now(), by, r.members()), Instant.now());
        });
        return Optional.ofNullable(e).map(Entry::room);
    }

    @Override
    public long roomsHostedBy(Long hostId) {
        return rooms.values().stream().filter(e -> e.room().hostId().equals(hostId)).count();
    }

    @Override
    public void publish(Room room) {
        handler.accept(room);
    }

    @Override
    public void onChange(Consumer<Room> handler) {
        this.handler = handler;
    }

    @Scheduled(fixedDelay = 60_000)
    void reap() {
        Instant cutoff = Instant.now().minus(IDLE_TTL);
        rooms.values().removeIf(e -> e.touched().isBefore(cutoff));
    }

    private static Room withMembers(Room r, LinkedHashMap<Long, String> members) {
        return new Room(r.code(), r.hostId(), r.animeKey(), r.episode(), r.playing(), r.position(), r.at(), r.by(), members);
    }
}
