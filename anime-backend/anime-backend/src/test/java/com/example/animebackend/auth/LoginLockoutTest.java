package com.example.animebackend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.auth.config.SecurityProperties;
import com.example.animebackend.auth.dto.LoginRequest;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.security.Argon2PepperPasswordEncoder;
import com.example.animebackend.auth.service.AuthService;
import com.example.animebackend.auth.web.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;

/**
 * Brute-force protection must actually persist.
 *
 * <p>Regression guard: the failure counter used to be written inside the login
 * transaction, which rolls back when the "invalid credentials" exception is
 * thrown — so the count never grew and an account could be guessed at forever.
 * These tests fail if the increment ever moves back into that transaction.
 */
@SpringBootTest
@ActiveProfiles("test")
class LoginLockoutTest {

    private static final String PASSWORD = "Winter-Ember-2026x";

    @Autowired
    private AuthService authService;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private Argon2PepperPasswordEncoder encoder;

    @Autowired
    private SecurityProperties security;

    private String email;

    @BeforeEach
    void createVerifiedUser() {
        email = "lockout-" + System.nanoTime() + "@example.com";
        users.save(AppUser.builder()
                .email(email)
                .passwordHash(encoder.encode(PASSWORD))
                .displayName("Lockout Target")
                .role(Role.USER)
                .emailVerified(true)
                .build());
    }

    @Test
    void failedAttemptsSurviveTheRejectionAndEventuallyLock() {
        int limit = security.maxFailedAttempts();

        for (int attempt = 1; attempt < limit; attempt++) {
            assertThatThrownBy(() -> login("definitely-not-the-password"))
                    .isInstanceOf(ApiException.class)
                    .hasFieldOrPropertyWithValue("code", "invalid_credentials");
            // The whole point: the counter is committed even though login threw.
            assertThat(users.findByEmailAndIsDeletedFalse(email).orElseThrow().getFailedAttempts())
                    .isEqualTo(attempt);
        }

        // The attempt that crosses the threshold locks the account.
        assertThatThrownBy(() -> login("definitely-not-the-password"))
                .isInstanceOf(ApiException.class);
        assertThat(users.findByEmailAndIsDeletedFalse(email).orElseThrow().getLockedUntil())
                .isNotNull();
    }

    @Test
    void correctPasswordIsRefusedWhileLocked() {
        for (int attempt = 0; attempt <= security.maxFailedAttempts(); attempt++) {
            try {
                login("wrong-" + attempt);
            } catch (ApiException ignored) {
                // expected on every attempt
            }
        }

        assertThatThrownBy(() -> login(PASSWORD))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.LOCKED);
    }

    @Test
    void successfulLoginClearsTheCounter() {
        try {
            login("wrong-once");
        } catch (ApiException ignored) {
            // expected
        }
        assertThat(users.findByEmailAndIsDeletedFalse(email).orElseThrow().getFailedAttempts())
                .isEqualTo(1);

        authService.login(new LoginRequest(email, PASSWORD), "127.0.0.1", "junit");

        assertThat(users.findByEmailAndIsDeletedFalse(email).orElseThrow().getFailedAttempts())
                .isZero();
    }

    private void login(String password) {
        authService.login(new LoginRequest(email, password), "127.0.0.1", "junit");
    }
}
