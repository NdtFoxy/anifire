package com.example.animebackend.auth.config;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

/**
 * User-upload storage settings (prefix {@code anifire.uploads}).
 *
 * @param dir directory the profile images are written to; served back at {@code /uploads/**}
 * @param maxFileSize largest accepted single image
 */
@ConfigurationProperties(prefix = "anifire.uploads")
public record UploadProperties(Path dir, DataSize maxFileSize) {

    /** Absolute, normalized storage root — the only path uploads may ever resolve into. */
    public Path root() {
        return dir.toAbsolutePath().normalize();
    }

    public long maxBytes() {
        return maxFileSize.toBytes();
    }
}
