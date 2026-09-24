package com.example.animebackend.party;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Optional;
import java.util.function.Consumer;

/**
 * Shared room state and fan-out. With Redis every API instance sees the same
 * rooms and every state change reaches the SSE streams held by any instance;
 * the in-memory store is for tests and single-process development.
 */
public interface PartyStore {

    Duration IDLE_TTL = Duration.ofHours(6);

    /** Authoritative room snapshot. Members keep join order. */
    record Room(
            String code,
            Long hostId,
            String animeKey,
            int episode,
            boolean playing,
            double position,
            Instant at,
            Long by,
            LinkedHashMap<Long, String> members) {}

    /** Creates the room; false when the code is already taken. */
    boolean create(Room room);

    Optional<Room> get(String code);

    /** Adds a member unless the room is full; returns the room after the change. */
    Optional<Room> addMember(String code, Long userId, String displayName, int maxMembers);

    /** Removes a member; deletes the room when it becomes empty. */
    Optional<Room> removeMember(String code, Long userId);

    /** Replaces the playback fields (not the members); returns the updated room. */
    Optional<Room> updatePlayback(String code, boolean playing, double position, int episode, String animeKey, Long by);

    long roomsHostedBy(Long hostId);

    /** Announces a room change to every instance, including this one. */
    void publish(Room room);

    /** Called once at start-up with the handler for changes announced by any instance. */
    void onChange(Consumer<Room> handler);
}
