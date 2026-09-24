package com.example.animebackend.party;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.stereotype.Component;

/**
 * Rooms in Redis, so any number of API instances share them. A room is two
 * hashes — playback fields and members — expiring after {@link #IDLE_TTL} without
 * activity. Changes are announced on one pub/sub channel carrying only the room
 * code; each instance re-reads the room and feeds its own SSE subscribers.
 */
@Component
@ConditionalOnProperty(name = "anifire.party.store", havingValue = "redis", matchIfMissing = true)
public class RedisPartyStore implements PartyStore {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RedisPartyStore.class);
    private static final String CHANNEL = "anifire:party-events";

    /** Join unless full, atomically: -1 no room, 0 full, 1 member. */
    private static final DefaultRedisScript<Long> ADD_MEMBER = new DefaultRedisScript<>("""
            if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
            if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then return 1 end
            if redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[3]) then return 0 end
            redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final RedisMessageListenerContainer listeners;

    /**
     * The listener container is a Spring-managed bean (see {@link Listeners}), so it
     * starts after the context is up and reconnects on its own: a Redis blip at
     * boot must not take the whole API down with it.
     */
    public RedisPartyStore(StringRedisTemplate redis, RedisMessageListenerContainer listeners) {
        this.redis = redis;
        this.listeners = listeners;
    }

    @org.springframework.context.annotation.Configuration
    @ConditionalOnProperty(name = "anifire.party.store", havingValue = "redis", matchIfMissing = true)
    static class Listeners {
        @org.springframework.context.annotation.Bean
        RedisMessageListenerContainer partyListenerContainer(RedisConnectionFactory connections) {
            RedisMessageListenerContainer container = new RedisMessageListenerContainer();
            container.setConnectionFactory(connections);
            container.setRecoveryInterval(5_000L);
            // Started by RedisPartyStore once the app is up: starting it with the
            // context would fail the whole boot while Redis is unreachable.
            container.setAutoStartup(false);
            return container;
        }
    }

    private static String roomKey(String code) {
        return "anifire:party:" + code;
    }

    private static String membersKey(String code) {
        return "anifire:party:" + code + ":members";
    }

    private static String hostKey(Long hostId) {
        return "anifire:party-host:" + hostId;
    }

    /** Subscribes in the background and keeps retrying until Redis answers. */
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    void subscribeWhenReady() {
        Thread.ofVirtual().name("party-subscriber").start(() -> {
            for (int attempt = 1; !listeners.isRunning(); attempt++) {
                try {
                    listeners.start();
                    log.info("Watch-party fan-out subscribed to Redis");
                } catch (RuntimeException e) {
                    if (attempt == 1 || attempt % 12 == 0) {
                        log.warn("Redis unavailable for watch parties, retrying: {}", e.getMessage());
                    }
                    try {
                        Thread.sleep(5_000);
                    } catch (InterruptedException ie) {
                        return;
                    }
                }
            }
        });
    }

    @Override
    public boolean create(Room room) {
        String key = roomKey(room.code());
        Boolean fresh = redis.opsForHash().putIfAbsent(key, "hostId", room.hostId().toString());
        if (!Boolean.TRUE.equals(fresh)) return false;
        redis.opsForHash().putAll(key, playbackFields(room));
        room.members().forEach((id, name) -> redis.opsForHash().put(membersKey(room.code()), id.toString(), member(name)));
        redis.opsForSet().add(hostKey(room.hostId()), room.code());
        touch(room.code(), room.hostId());
        return true;
    }

    @Override
    public Optional<Room> get(String code) {
        Map<Object, Object> fields = redis.opsForHash().entries(roomKey(code));
        if (fields.isEmpty() || fields.get("hostId") == null) return Optional.empty();
        Map<Object, Object> raw = redis.opsForHash().entries(membersKey(code));
        List<Map.Entry<Object, Object>> ordered = new ArrayList<>(raw.entrySet());
        ordered.sort(Comparator.comparingLong(e -> Long.parseLong(e.getValue().toString().split("\\|", 2)[0])));
        LinkedHashMap<Long, String> members = new LinkedHashMap<>();
        for (Map.Entry<Object, Object> e : ordered) {
            members.put(Long.valueOf(e.getKey().toString()), e.getValue().toString().split("\\|", 2)[1]);
        }
        Object by = fields.get("by");
        return Optional.of(new Room(
                code,
                Long.valueOf(fields.get("hostId").toString()),
                String.valueOf(fields.get("animeKey")),
                Integer.parseInt(fields.get("episode").toString()),
                Boolean.parseBoolean(fields.get("playing").toString()),
                Double.parseDouble(fields.get("position").toString()),
                Instant.ofEpochMilli(Long.parseLong(fields.get("at").toString())),
                by == null || by.toString().isEmpty() ? null : Long.valueOf(by.toString()),
                members));
    }

    @Override
    public Optional<Room> addMember(String code, Long userId, String displayName, int maxMembers) {
        Long result = redis.execute(ADD_MEMBER, List.of(roomKey(code), membersKey(code)),
                userId.toString(), member(displayName), String.valueOf(maxMembers));
        if (result == null || result < 0) return Optional.empty();
        Optional<Room> room = get(code);
        room.ifPresent(r -> touch(code, r.hostId()));
        return room;
    }

    @Override
    public Optional<Room> removeMember(String code, Long userId) {
        Optional<Room> before = get(code);
        if (before.isEmpty()) return Optional.empty();
        redis.opsForHash().delete(membersKey(code), userId.toString());
        Long left = redis.opsForHash().size(membersKey(code));
        if (left == null || left == 0) {
            redis.delete(List.of(roomKey(code), membersKey(code)));
            redis.opsForSet().remove(hostKey(before.get().hostId()), code);
            return Optional.empty();
        }
        return get(code);
    }

    @Override
    public Optional<Room> updatePlayback(
            String code, boolean playing, double position, int episode, String animeKey, Long by) {
        Optional<Room> current = get(code);
        if (current.isEmpty()) return Optional.empty();
        Room r = current.get();
        Room next = new Room(code, r.hostId(), animeKey == null ? r.animeKey() : animeKey, episode, playing, position,
                Instant.now(), by, r.members());
        redis.opsForHash().putAll(roomKey(code), playbackFields(next));
        touch(code, r.hostId());
        return Optional.of(next);
    }

    @Override
    public long roomsHostedBy(Long hostId) {
        var codes = redis.opsForSet().members(hostKey(hostId));
        if (codes == null) return 0;
        long live = 0;
        for (String code : codes) {
            if (Boolean.TRUE.equals(redis.hasKey(roomKey(code)))) live++;
            else redis.opsForSet().remove(hostKey(hostId), code);
        }
        return live;
    }

    @Override
    public void publish(Room room) {
        redis.convertAndSend(CHANNEL, room.code());
    }

    @Override
    public void onChange(Consumer<Room> handler) {
        listeners.addMessageListener((message, pattern) -> {
            String code = new String(message.getBody(), StandardCharsets.UTF_8);
            get(code).ifPresent(handler);
        }, new ChannelTopic(CHANNEL));
    }

    private void touch(String code, Long hostId) {
        redis.expire(roomKey(code), IDLE_TTL);
        redis.expire(membersKey(code), IDLE_TTL);
        redis.expire(hostKey(hostId), IDLE_TTL);
    }

    private static String member(String displayName) {
        return System.currentTimeMillis() + "|" + displayName;
    }

    private static Map<String, String> playbackFields(Room r) {
        Map<String, String> m = new HashMap<>();
        m.put("animeKey", r.animeKey());
        m.put("episode", String.valueOf(r.episode()));
        m.put("playing", String.valueOf(r.playing()));
        m.put("position", String.valueOf(r.position()));
        m.put("at", String.valueOf(r.at().toEpochMilli()));
        m.put("by", r.by() == null ? "" : r.by().toString());
        return m;
    }
}
