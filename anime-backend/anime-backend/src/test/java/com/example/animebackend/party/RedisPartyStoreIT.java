package com.example.animebackend.party;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Two API instances ("nodes") sharing one Redis: a room created on one is
 * joinable and controllable through the other, and every change reaches the
 * listeners of both — which is what lets watch parties run behind a load balancer.
 */
@Tag("redis")
@Testcontainers
class RedisPartyStoreIT {

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);

    static LettuceConnectionFactory factoryA;
    static LettuceConnectionFactory factoryB;
    static RedisMessageListenerContainer listenersA;
    static RedisMessageListenerContainer listenersB;
    static RedisPartyStore nodeA;
    static RedisPartyStore nodeB;

    static LettuceConnectionFactory factory() {
        LettuceConnectionFactory f = new LettuceConnectionFactory(REDIS.getHost(), REDIS.getMappedPort(6379));
        f.afterPropertiesSet();
        f.start();
        return f;
    }

    static RedisMessageListenerContainer listeners(LettuceConnectionFactory f) {
        RedisMessageListenerContainer c = new RedisMessageListenerContainer();
        c.setConnectionFactory(f);
        c.afterPropertiesSet();
        c.start();
        return c;
    }

    @BeforeAll
    static void nodes() {
        factoryA = factory();
        factoryB = factory();
        listenersA = listeners(factoryA);
        listenersB = listeners(factoryB);
        nodeA = new RedisPartyStore(new StringRedisTemplate(factoryA), listenersA);
        nodeB = new RedisPartyStore(new StringRedisTemplate(factoryB), listenersB);
    }

    @AfterAll
    static void close() throws Exception {
        listenersA.destroy();
        listenersB.destroy();
        factoryA.destroy();
        factoryB.destroy();
    }

    private static PartyStore.Room room(String code, long host) {
        LinkedHashMap<Long, String> members = new LinkedHashMap<>();
        members.put(host, "Хост");
        return new PartyStore.Room(code, host, "52991", 1, false, 0, Instant.now(), null, members);
    }

    @Test
    void changesMadeOnOneNodeReachListenersOnTheOther() throws Exception {
        BlockingQueue<PartyStore.Room> seenByA = new LinkedBlockingQueue<>();
        nodeA.onChange(seenByA::add);
        Thread.sleep(300); // let the subscription register

        assertThat(nodeA.create(room("abc123", 1L))).isTrue();
        assertThat(nodeB.create(room("abc123", 2L))).as("codes are unique across nodes").isFalse();

        PartyStore.Room joined = nodeB.addMember("abc123", 7L, "Гость", 20).orElseThrow();
        assertThat(joined.members().keySet()).containsExactly(1L, 7L);

        PartyStore.Room playing = nodeB.updatePlayback("abc123", true, 120.5, 2, null, 7L).orElseThrow();
        nodeB.publish(playing);

        PartyStore.Room received = seenByA.poll(5, TimeUnit.SECONDS);
        assertThat(received).isNotNull();
        assertThat(received.playing()).isTrue();
        assertThat(received.position()).isEqualTo(120.5);
        assertThat(received.episode()).isEqualTo(2);
        assertThat(received.by()).isEqualTo(7L);
        assertThat(received.members().keySet()).containsExactly(1L, 7L);
    }

    @Test
    void fullRoomRefusesNewMembersAndEmptyRoomDisappears() {
        nodeA.create(room("full01", 1L));
        nodeB.addMember("full01", 2L, "Два", 2).orElseThrow();
        PartyStore.Room refused = nodeB.addMember("full01", 3L, "Три", 2).orElseThrow();
        assertThat(refused.members()).doesNotContainKey(3L);
        assertThat(nodeA.roomsHostedBy(1L)).isGreaterThanOrEqualTo(1);

        nodeA.removeMember("full01", 2L);
        assertThat(nodeB.removeMember("full01", 1L)).isEmpty();
        assertThat(nodeA.get("full01")).isEmpty();
        assertThat(nodeB.addMember("full01", 9L, "Поздно", 20)).isEmpty();
    }
}
