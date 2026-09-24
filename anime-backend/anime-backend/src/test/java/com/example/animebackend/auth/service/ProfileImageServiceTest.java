package com.example.animebackend.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.auth.config.UploadProperties;
import com.example.animebackend.auth.dto.ProfileDto;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.web.ApiException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;

/**
 * Upload contract: only real images land in the publicly served directory, the stored
 * name is server-generated, and replacing or clearing an image removes the old file.
 */
@SpringBootTest
@ActiveProfiles("test")
class ProfileImageServiceTest {

    /** 1x1 transparent PNG. */
    private static final byte[] PNG =
            HexFormat.of()
                    .parseHex(
                            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
                                + "0000000a49444154789c6360000002000100ffff03000006000557bfabd4"
                                + "0000000049454e44ae426082");

    @Autowired
    private ProfileImageService images;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private UploadProperties props;

    private Long userId;

    @BeforeEach
    void createUser() {
        AppUser user = new AppUser();
        user.setEmail("uploader-" + System.nanoTime() + "@example.com");
        user.setPasswordHash("x");
        user.setDisplayName("Uploader");
        user.setRole(Role.USER);
        userId = users.save(user).getId();
    }

    @Test
    void storesPngUnderServerGeneratedName() throws IOException {
        ProfileDto dto = images.store(userId, "avatar", png("holiday snap.png"));

        assertThat(dto.avatarUrl()).matches("/uploads/" + userId + "-avatar-[0-9a-f-]{36}\\.png");
        assertThat(stored(dto.avatarUrl())).exists();
        // The client filename never reaches disk.
        assertThat(dto.avatarUrl()).doesNotContain("holiday");
    }

    @Test
    void replacingAnImageDeletesThePreviousFile() throws IOException {
        Path first = stored(images.store(userId, "avatar", png("a.png")).avatarUrl());
        Path second = stored(images.store(userId, "avatar", png("b.png")).avatarUrl());

        assertThat(first).doesNotExist();
        assertThat(second).exists();
    }

    @Test
    void clearingRemovesTheFileAndNullsTheField() throws IOException {
        Path file = stored(images.store(userId, "banner", png("b.png")).bannerUrl());

        ProfileDto dto = images.clear(userId, "banner");

        assertThat(dto.bannerUrl()).isNull();
        assertThat(file).doesNotExist();
    }

    @Test
    void avatarAndBannerAreIndependent() {
        images.store(userId, "avatar", png("a.png"));
        ProfileDto dto = images.store(userId, "banner", png("b.png"));

        assertThat(dto.avatarUrl()).isNotNull();
        assertThat(dto.bannerUrl()).isNotNull();
        assertThat(dto.avatarUrl()).isNotEqualTo(dto.bannerUrl());
    }

    @Test
    void rejectsNonImageContentDeclaredAsPng() {
        MockMultipartFile fake =
                new MockMultipartFile(
                        "file",
                        "payload.png",
                        "image/png",
                        "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> images.store(userId, "avatar", fake))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "invalid_image");
    }

    @Test
    void rejectsDeclaredTypeThatContradictsTheBytes() {
        MockMultipartFile mismatched =
                new MockMultipartFile("file", "a.gif", "image/gif", PNG);

        assertThatThrownBy(() -> images.store(userId, "avatar", mismatched))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "invalid_image");
    }

    @Test
    void rejectsUnsupportedTypeEmptyFileAndUnknownKind() {
        assertThatThrownBy(
                        () ->
                                images.store(
                                        userId,
                                        "avatar",
                                        new MockMultipartFile(
                                                "file", "a.txt", "text/plain", PNG)))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(
                        () ->
                                images.store(
                                        userId,
                                        "avatar",
                                        new MockMultipartFile(
                                                "file", "a.png", "image/png", new byte[0])))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> images.store(userId, "wallpaper", png("a.png")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsOversizedUploadWithoutLeavingTempFiles() throws IOException {
        byte[] oversized = new byte[(int) props.maxBytes() + 1024];
        System.arraycopy(PNG, 0, oversized, 0, PNG.length);

        assertThatThrownBy(
                        () ->
                                images.store(
                                        userId,
                                        "avatar",
                                        new MockMultipartFile(
                                                "file", "big.png", "image/png", oversized)))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "image_too_large");

        assertThat(leftovers()).isEmpty();
    }

    private MockMultipartFile png(String filename) {
        return new MockMultipartFile("file", filename, "image/png", PNG);
    }

    private Path stored(String url) {
        return props.root().resolve(url.substring("/uploads/".length()));
    }

    private List<Path> leftovers() throws IOException {
        try (var files = Files.list(props.root())) {
            return files.filter(p -> p.getFileName().toString().endsWith(".part")).toList();
        }
    }
}
