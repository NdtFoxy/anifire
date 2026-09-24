package com.example.animebackend.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.animebackend.auth.dto.RegisterRequest;
import com.example.animebackend.auth.service.AuthService;
import com.example.animebackend.auth.web.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;

/** Sign-up limits: a shared address is not a spammer, one inbox is not a target. */
@SpringBootTest
@ActiveProfiles("test")
class RegistrationLimitsTest {

    @Autowired AuthService auth;

    private static RegisterRequest req(String email) {
        return new RegisterRequest(email, "Crimson-Lantern-Wx9", "Limit Test");
    }

    @Test
    void manyPeopleBehindOneAddressCanSignUp() {
        String ip = "203.0.113." + (System.nanoTime() % 200);
        for (int i = 0; i < 10; i++) {
            String email = "nat-" + System.nanoTime() + "-" + i + "@anifire.test";
            assertThatCode(() -> auth.register(req(email), ip, null)).doesNotThrowAnyException();
        }
    }

    @Test
    void oneInboxCannotBeFloodedFromDifferentAddresses() {
        String email = "target-" + System.nanoTime() + "@anifire.test";
        for (int i = 0; i < 3; i++) auth.register(req(email), "198.51.100." + i, null);
        assertThatThrownBy(() -> auth.register(req(email), "198.51.100.99", null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> org.assertj.core.api.Assertions.assertThat(e.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }
}
