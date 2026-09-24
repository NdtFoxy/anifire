package com.example.animebackend.storage;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Where user uploads live. Keys are server-generated file names; the public URL of
 * a key is always {@code /uploads/<key>} on the site's own origin — served by the
 * API from disk (local) or by the reverse proxy straight from the bucket (S3).
 */
public interface MediaStorage {

    String URL_PREFIX = "/uploads/";

    /** Stores a fully validated file under {@code key}; the source file may be consumed. */
    void put(String key, Path file, String contentType) throws IOException;

    /** Best-effort removal; a leftover object is harmless. */
    void delete(String key);

    static String url(String key) {
        return URL_PREFIX + key;
    }

    /** The key behind one of our own URLs, or null for anything else (remote URLs, traversal). */
    static String keyOf(String url) {
        if (url == null || !url.startsWith(URL_PREFIX)) return null;
        String key = url.substring(URL_PREFIX.length());
        return key.isEmpty() || key.contains("/") || key.contains("\\") || key.startsWith(".") ? null : key;
    }
}
