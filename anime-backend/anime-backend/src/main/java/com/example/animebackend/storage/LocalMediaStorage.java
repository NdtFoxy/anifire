package com.example.animebackend.storage;

import com.example.animebackend.auth.config.UploadProperties;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Uploads on the API's own disk (dev, single host), served by StaticUploadsConfig. */
@Component
@ConditionalOnProperty(name = "anifire.uploads.storage", havingValue = "local", matchIfMissing = true)
public class LocalMediaStorage implements MediaStorage {

    private final UploadProperties props;

    public LocalMediaStorage(UploadProperties props) {
        this.props = props;
    }

    @Override
    public void put(String key, Path file, String contentType) throws IOException {
        Path root = props.root();
        Files.createDirectories(root);
        Path target = root.resolve(key).normalize();
        if (!target.getParent().equals(root)) throw new IOException("Refusing key outside the upload root");
        try {
            Files.move(file, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(file, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    @Override
    public void delete(String key) {
        Path root = props.root();
        Path target = root.resolve(key).normalize();
        if (!target.startsWith(root) || target.equals(root)) return;
        try {
            Files.deleteIfExists(target);
        } catch (IOException ignored) {
            // A leftover file is harmless; failing the request over it is not.
        }
    }
}
