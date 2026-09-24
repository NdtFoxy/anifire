package com.example.animebackend.auth.service;

import com.example.animebackend.auth.config.UploadProperties;
import com.example.animebackend.auth.dto.ProfileDto;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.web.ApiException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Stores and removes the avatar / banner images of the signed-in user.
 *
 * <p>The declared content type is never trusted: every upload is written to a temp file first,
 * sniffed by magic bytes, and only then moved into place under a server-generated name. The
 * extension comes from the sniffed type, so a renamed {@code .txt} — or an {@code .html} payload
 * claiming to be a PNG — never lands in the publicly served directory.
 */
@Service
public class ProfileImageService {

    /** Kinds the profile page can upload; anything else is a client bug. */
    private static final String AVATAR = "avatar";
    private static final String BANNER = "banner";

    private static final Set<String> ALLOWED_TYPES =
            Set.of("image/png", "image/jpeg", "image/webp", "image/gif");

    /** Public path prefix the stored URLs use (see StaticUploadsConfig). */
    private static final String URL_PREFIX = "/uploads/";

    private final AppUserRepository users;
    private final ProfileService profiles;
    private final UploadProperties props;

    public ProfileImageService(
            AppUserRepository users, ProfileService profiles, UploadProperties props) {
        this.users = users;
        this.profiles = profiles;
        this.props = props;
    }

    /** Replaces the user's {@code avatar} or {@code banner} image and deletes the previous file. */
    @Transactional
    public ProfileDto store(Long userId, String kind, MultipartFile file) {
        String field = kind(kind);
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("invalid_image", "Pick an image file first.");
        }
        long max = props.maxBytes();
        if (file.getSize() > max) {
            throw ApiException.badRequest(
                    "image_too_large", "Images must be " + megabytes(max) + " MB or smaller.");
        }
        String declared = normalizeType(file.getContentType());
        if (!ALLOWED_TYPES.contains(declared)) {
            throw ApiException.badRequest(
                    "invalid_image", "Only PNG, JPEG, WebP or GIF images are accepted.");
        }

        AppUser user = load(userId);
        Path root = props.root();
        Path temp = null;
        try {
            Files.createDirectories(root);
            temp = Files.createTempFile(root, ".upload-", ".part");
            long written = copy(file, temp, max);
            if (written == 0) {
                throw ApiException.badRequest("invalid_image", "The uploaded file is empty.");
            }
            ImageType sniffed = sniff(temp);
            if (sniffed == null || !sniffed.mime.equals(declared)) {
                throw ApiException.badRequest(
                        "invalid_image", "That file is not a valid PNG, JPEG, WebP or GIF image.");
            }

            String filename = userId + "-" + field + "-" + UUID.randomUUID() + "." + sniffed.ext;
            move(temp, root.resolve(filename));
            temp = null;

            String previous = AVATAR.equals(field) ? user.getAvatarUrl() : user.getBannerUrl();
            if (AVATAR.equals(field)) {
                user.setAvatarUrl(URL_PREFIX + filename);
            } else {
                user.setBannerUrl(URL_PREFIX + filename);
            }
            users.save(user);
            deleteStored(previous);
        } catch (IOException e) {
            throw new IllegalStateException("Could not store the uploaded image.", e);
        } finally {
            deleteQuietly(temp);
        }
        return profiles.get(userId);
    }

    /** Drops the stored image (and its file) for {@code avatar} or {@code banner}. */
    @Transactional
    public ProfileDto clear(Long userId, String kind) {
        String field = kind(kind);
        AppUser user = load(userId);
        String previous;
        if (AVATAR.equals(field)) {
            previous = user.getAvatarUrl();
            user.setAvatarUrl(null);
        } else {
            previous = user.getBannerUrl();
            user.setBannerUrl(null);
        }
        users.save(user);
        deleteStored(previous);
        return profiles.get(userId);
    }

    // ───────────────────────── internals ─────────────────────────

    private AppUser load(Long userId) {
        return users
                .findById(userId)
                .filter(u -> !u.isDeleted())
                .orElseThrow(
                        () ->
                                ApiException.unauthorized(
                                        "user_not_found", "Account no longer exists."));
    }

    private static String kind(String kind) {
        if (AVATAR.equals(kind) || BANNER.equals(kind)) {
            return kind;
        }
        throw ApiException.badRequest("invalid_image", "Unknown image kind: " + kind);
    }

    private static String normalizeType(String contentType) {
        if (contentType == null) {
            return "";
        }
        int semi = contentType.indexOf(';');
        String base = semi < 0 ? contentType : contentType.substring(0, semi);
        return base.trim().toLowerCase(Locale.ROOT);
    }

    private static long megabytes(long bytes) {
        return bytes / (1024 * 1024);
    }

    /** Streams the upload to {@code target}, aborting as soon as it exceeds {@code max} bytes. */
    private static long copy(MultipartFile file, Path target, long max) throws IOException {
        byte[] buffer = new byte[8192];
        long total = 0;
        try (InputStream in = file.getInputStream();
                OutputStream out = Files.newOutputStream(target)) {
            int read;
            while ((read = in.read(buffer)) != -1) {
                total += read;
                if (total > max) {
                    throw ApiException.badRequest(
                            "image_too_large",
                            "Images must be " + megabytes(max) + " MB or smaller.");
                }
                out.write(buffer, 0, read);
            }
        }
        return total;
    }

    private static void move(Path from, Path to) throws IOException {
        try {
            Files.move(from, to, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            // Temp and target share a directory, so this only happens on exotic filesystems.
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Removes a previously stored file, ignoring remote URLs and anything outside the root. */
    private void deleteStored(String storedUrl) {
        if (storedUrl == null || !storedUrl.startsWith(URL_PREFIX)) {
            return;
        }
        Path root = props.root();
        Path target = root.resolve(storedUrl.substring(URL_PREFIX.length())).normalize();
        if (!target.startsWith(root) || target.equals(root)) {
            return;
        }
        deleteQuietly(target);
    }

    private static void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // A leftover file is harmless; failing the request over it is not.
        }
    }

    // ───────────────────────── magic bytes ─────────────────────────

    private enum ImageType {
        PNG("image/png", "png"),
        JPEG("image/jpeg", "jpg"),
        GIF("image/gif", "gif"),
        WEBP("image/webp", "webp");

        private final String mime;
        private final String ext;

        ImageType(String mime, String ext) {
            this.mime = mime;
            this.ext = ext;
        }
    }

    private static final byte[] PNG_MAGIC = {
        (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    };
    private static final byte[] JPEG_MAGIC = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] GIF_MAGIC = {0x47, 0x49, 0x46, 0x38}; // "GIF8"
    private static final byte[] RIFF_MAGIC = {0x52, 0x49, 0x46, 0x46}; // "RIFF"
    private static final byte[] WEBP_MAGIC = {0x57, 0x45, 0x42, 0x50}; // "WEBP"

    /** Reads the leading bytes of {@code file} and returns the real image type, or null. */
    private static ImageType sniff(Path file) throws IOException {
        byte[] head = new byte[12];
        int read;
        try (InputStream in = Files.newInputStream(file)) {
            read = in.readNBytes(head, 0, head.length);
        }
        if (startsWith(head, read, PNG_MAGIC)) {
            return ImageType.PNG;
        }
        if (startsWith(head, read, JPEG_MAGIC)) {
            return ImageType.JPEG;
        }
        if (startsWith(head, read, GIF_MAGIC)) {
            return ImageType.GIF;
        }
        if (read >= 12
                && startsWith(head, read, RIFF_MAGIC)
                && Arrays.equals(head, 8, 12, WEBP_MAGIC, 0, 4)) {
            return ImageType.WEBP;
        }
        return null;
    }

    private static boolean startsWith(byte[] head, int length, byte[] magic) {
        return length >= magic.length && Arrays.equals(head, 0, magic.length, magic, 0, magic.length);
    }
}
