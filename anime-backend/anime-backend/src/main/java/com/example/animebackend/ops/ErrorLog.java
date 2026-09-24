package com.example.animebackend.ops;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Last-N server errors, kept in memory for the admin console.
 *
 * <p>Deliberately not a table: an error store that writes to the database fails
 * exactly when the database is the thing that broke. A bounded ring buffer costs
 * nothing, survives the request that produced it, and is honest about being lost
 * on restart — which the UI says out loud.
 */
@Component
public class ErrorLog {

    public record Entry(
            Instant at, String method, String path, String type, String message, Long userId) {}

    private static final int CAPACITY = 100;
    private final Deque<Entry> entries = new ArrayDeque<>(CAPACITY);

    public synchronized void record(Entry entry) {
        if (entries.size() == CAPACITY) entries.removeLast();
        entries.addFirst(entry);
    }

    public synchronized List<Entry> recent(int limit) {
        return entries.stream().limit(Math.clamp(limit, 1, CAPACITY)).toList();
    }

    public synchronized int size() {
        return entries.size();
    }
}
