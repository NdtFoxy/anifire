package com.example.animebackend.auth.service;

import com.example.animebackend.auth.config.SecurityProperties;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.repository.AppUserRepository;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records failed sign-in attempts and locks an account that crosses the limit.
 *
 * <p>This lives in its own bean, and its own transaction, for a reason: the login
 * path fails by throwing, which rolls the surrounding transaction back. Counting
 * the failure inside that transaction means the increment is discarded with it —
 * the counter never grows, the lockout never fires, and unlimited password
 * guessing is possible against a real account. {@code REQUIRES_NEW} commits the
 * attempt independently of the rejection that follows it.
 */
@Service
public class LoginAttemptService {

    private static final Logger log = LoggerFactory.getLogger(LoginAttemptService.class);

    private final AppUserRepository users;
    private final SecurityProperties security;

    public LoginAttemptService(AppUserRepository users, SecurityProperties security) {
        this.users = users;
        this.security = security;
    }

    /** Increments the counter for this user and locks the account at the threshold. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void registerFailure(Long userId) {
        AppUser user = users.findById(userId).orElse(null);
        if (user == null) {
            return;
        }
        int attempts = user.getFailedAttempts() + 1;
        if (attempts >= security.maxFailedAttempts()) {
            user.setFailedAttempts(0);
            user.setLockedUntil(Instant.now().plus(security.lockDuration()));
            log.warn("Account locked after {} failed logins: id={}", attempts, userId);
        } else {
            user.setFailedAttempts(attempts);
        }
        users.save(user);
    }
}
