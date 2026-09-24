package com.example.animebackend.auth.service;

import com.example.animebackend.auth.config.SecurityProperties;
import com.example.animebackend.auth.dto.AuthResponse;
import com.example.animebackend.auth.dto.LoginRequest;
import com.example.animebackend.auth.dto.RegisterRequest;
import com.example.animebackend.auth.dto.ResetPasswordRequest;
import com.example.animebackend.auth.dto.SocialLoginRequest;
import com.example.animebackend.auth.dto.UserDto;
import com.example.animebackend.auth.entity.AppUser;
import com.example.animebackend.auth.entity.Role;
import com.example.animebackend.auth.entity.SocialIdentity;
import com.example.animebackend.auth.entity.TokenType;
import com.example.animebackend.auth.repository.AppUserRepository;
import com.example.animebackend.auth.repository.SocialIdentityRepository;
import com.example.animebackend.auth.security.Argon2PepperPasswordEncoder;
import com.example.animebackend.auth.security.JwtService;
import com.example.animebackend.auth.security.OidcTokenVerifier;
import com.example.animebackend.auth.security.RateLimiterService;
import com.example.animebackend.auth.security.Tokens;
import com.example.animebackend.auth.web.ApiException;
import com.example.animebackend.billing.service.Entitlement;
import com.example.animebackend.billing.service.EntitlementService;
import com.example.animebackend.mail.EmailService;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** Sign-ups per address per hour; generous enough for a shared (NAT) address. */
    static final int REGISTER_PER_IP_HOURLY = 30;
    static final int MAIL_REQUESTS_PER_IP_HOURLY = 20;
    /** Mails any one inbox can be made to receive per hour through these endpoints. */
    static final int MAIL_PER_ADDRESS_HOURLY = 3;

    /** Carries the issued tokens back to the controller, which sets the refresh cookie. */
    public record AuthResult(JwtService.AccessToken accessToken, String refreshToken, UserDto user) {
        public AuthResponse toResponse() {
            return new AuthResponse(accessToken.value(), "Bearer", accessToken.expiresInSeconds(), user);
        }
    }

    private final AppUserRepository userRepo;
    private final Argon2PepperPasswordEncoder encoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokens;
    private final VerificationTokenService verificationTokens;
    private final EmailService emailService;
    private final PwnedPasswordService pwned;
    private final RateLimiterService rateLimiter;
    private final SecurityProperties security;
    private final EntitlementService entitlements;
    private final SocialIdentityRepository socialIdentities;
    private final OidcTokenVerifier oidc;
    private final LoginAttemptService loginAttempts;

    /** Pre-computed hash so login timing is identical whether or not the user exists. */
    private final String dummyHash;

    public AuthService(
            AppUserRepository userRepo,
            Argon2PepperPasswordEncoder encoder,
            JwtService jwtService,
            RefreshTokenService refreshTokens,
            VerificationTokenService verificationTokens,
            EmailService emailService,
            PwnedPasswordService pwned,
            RateLimiterService rateLimiter,
            SecurityProperties security,
            EntitlementService entitlements,
            SocialIdentityRepository socialIdentities,
            OidcTokenVerifier oidc,
            LoginAttemptService loginAttempts) {
        this.userRepo = userRepo;
        this.encoder = encoder;
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
        this.verificationTokens = verificationTokens;
        this.emailService = emailService;
        this.pwned = pwned;
        this.rateLimiter = rateLimiter;
        this.security = security;
        this.entitlements = entitlements;
        this.socialIdentities = socialIdentities;
        this.oidc = oidc;
        this.loginAttempts = loginAttempts;
        this.dummyHash = encoder.encode("timing-equalizer-not-a-real-password");
    }

    // ───────────────────────── Registration ─────────────────────────

    @Transactional
    public void register(RegisterRequest req, String ip, String country) {
        // Two limits, two threats. Per IP stops scripted mass sign-up but must let
        // a household, office or mobile carrier NAT (many people, one address)
        // through; per email stops using sign-up to flood someone's inbox with
        // verification / "account exists" mails.
        if (!rateLimiter.allow("register:ip:" + ip, REGISTER_PER_IP_HOURLY, Duration.ofHours(1))
                || !rateLimiter.allow("register:email:" + normalize(req.email()), MAIL_PER_ADDRESS_HOURLY, Duration.ofHours(1))) {
            throw ApiException.tooManyRequests("Слишком много регистраций. Попробуйте позже.");
        }
        if (security.breachCheckEnabled() && pwned.isBreached(req.password())) {
            throw ApiException.badRequest("weak_password",
                    "Этот пароль встречался в утечках данных. Выберите другой.");
        }
        String email = normalize(req.email());

        // Non-enumerating: respond identically whether or not the account exists.
        if (userRepo.existsByEmailAndIsDeletedFalse(email)) {
            emailService.sendAccountExistsNotice(email);
            return;
        }

        boolean autoVerify = security.autoVerifyEmail();
        AppUser user = AppUser.builder()
                .signupCountry(country)
                .passwordChangedAt(Instant.now())
                .email(email)
                .passwordHash(encoder.encode(req.password()))
                .displayName(displayName(req.displayName(), email))
                .role(userRepo.countByIsDeletedFalse() == 0 ? Role.ADMIN : Role.USER)
                .emailVerified(autoVerify)
                .build();
        userRepo.save(user);

        // In dev (auto-verify) we skip the email round-trip entirely; otherwise
        // issue a verification token and email it (sent after this transaction commits).
        if (!autoVerify) {
            String token = verificationTokens.issue(user.getId(), TokenType.EMAIL_VERIFY);
            emailService.sendVerification(email, token);
        }
        log.info("Registered new user id={} (autoVerify={})", user.getId(), autoVerify);
    }

    // ───────────────────────── Login ─────────────────────────

    @Transactional
    public AuthResult login(LoginRequest req, String ip, String userAgent) {
        if (!rateLimiter.allow("login:ip:" + ip, 60, Duration.ofMinutes(1))) {
            throw ApiException.tooManyRequests("Слишком много попыток. Попробуйте чуть позже.");
        }
        String email = normalize(req.email());
        if (!rateLimiter.allow("login:acct:" + email, 20, Duration.ofMinutes(5))) {
            throw ApiException.tooManyRequests("Слишком много попыток. Попробуйте чуть позже.");
        }

        AppUser user = userRepo.findByEmailAndIsDeletedFalse(email).orElse(null);

        if (user != null && user.getLockedUntil() != null
                && user.getLockedUntil().isAfter(Instant.now())) {
            throw ApiException.locked("Аккаунт временно заблокирован. Попробуйте позже.");
        }

        // Always run a hash comparison to equalize timing (anti-enumeration).
        boolean ok = (user != null)
                ? encoder.matches(req.password(), user.getPasswordHash())
                : runDummy(req.password());

        if (!ok) {
            if (user != null) {
                // Committed in its own transaction: this method throws next, and the
                // rollback would otherwise erase the attempt we just counted.
                loginAttempts.registerFailure(user.getId());
            }
            throw ApiException.unauthorized("invalid_credentials", "Неверная почта или пароль.");
        }

        // Require a verified email unless dev auto-verify is on.
        if (!security.autoVerifyEmail() && !user.isEmailVerified()) {
            throw ApiException.forbidden(
                    "email_not_verified",
                    "Сначала подтвердите почту — мы отправили вам ссылку.");
        }

        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(Instant.now());
        userRepo.save(user);

        return issueTokens(user, ip, userAgent);
    }

    /**
     * Signs a user in with a provider-issued ID token.
     *
     * <p>The token is fully verified first ({@link OidcTokenVerifier}); everything
     * below trusts only the provider subject that verification returned.
     *
     * <p>Linking rules, which is where OAuth logins usually go wrong:
     * <ul>
     *   <li>A known {@code (provider, subject)} pair signs into the account it is
     *       already linked to. The email in the token is irrelevant here, so a
     *       provider-side address change cannot hijack a different account.</li>
     *   <li>An unknown subject whose email matches an existing local account only
     *       links when that account's email is verified. Otherwise anyone able to
     *       create a provider account for an address could seize a local account
     *       that never proved ownership of it.</li>
     *   <li>Otherwise a fresh account is created, already email-verified, with a
     *       random unusable password hash so the password login path can never be
     *       entered for it without a reset.</li>
     * </ul>
     * New accounts are never granted ADMIN — the old demo path handed the role to
     * whoever signed in first.
     */
    @Transactional
    public AuthResult socialLogin(SocialLoginRequest req, String ip, String userAgent) {
        String provider = normalizeProvider(req.provider());
        if (!rateLimiter.allow("social:ip:" + ip, 20, Duration.ofMinutes(5))) {
            throw ApiException.tooManyRequests("Слишком много попыток. Попробуйте чуть позже.");
        }

        OidcTokenVerifier.Identity identity =
                oidc.verify(provider, req.idToken(), req.nonce());

        SocialIdentity link =
                socialIdentities.findByProviderAndSubject(provider, identity.subject()).orElse(null);

        AppUser user;
        if (link != null) {
            user = userRepo.findById(link.getUserId())
                    .filter(u -> !u.isDeleted())
                    .orElseThrow(() -> ApiException.unauthorized(
                            "account_unavailable", "Этот аккаунт больше недоступен."));
        } else {
            AppUser existing = userRepo.findByEmailAndIsDeletedFalse(identity.email()).orElse(null);
            if (existing != null && !existing.isEmailVerified()) {
                throw ApiException.badRequest(
                        "verify_email_first",
                        "Эта почта уже занята неподтверждённым аккаунтом. Подтвердите её, затем привяжите "
                                + provider + " в профиле.");
            }
            user = existing != null ? existing : createSocialUser(identity);
            socialIdentities.save(SocialIdentity.builder()
                    .userId(user.getId())
                    .provider(provider)
                    .subject(identity.subject())
                    .emailAtLink(identity.email())
                    .lastLoginAt(Instant.now())
                    .build());
            log.info("Linked {} identity to user id={}", provider, user.getId());
        }

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            throw ApiException.locked("Аккаунт временно заблокирован. Попробуйте позже.");
        }

        if (link != null) {
            link.setLastLoginAt(Instant.now());
            socialIdentities.save(link);
        }
        user.setFailedAttempts(0);
        user.setLastLoginAt(Instant.now());
        userRepo.save(user);
        return issueTokens(user, ip, userAgent);
    }

    private AppUser createSocialUser(OidcTokenVerifier.Identity identity) {
        String label = identity.name() != null && !identity.name().isBlank()
                ? identity.name().trim()
                : providerLabel(identity.provider()) + " user";
        return userRepo.save(AppUser.builder()
                .email(identity.email())
                .passwordHash(encoder.encode(Tokens.random()))
                .displayName(label.length() > 60 ? label.substring(0, 60) : label)
                .role(Role.USER)
                .emailVerified(true)
                .build());
    }


    private boolean runDummy(String password) {
        encoder.matches(password, dummyHash);
        return false;
    }

    // ───────────────────────── Refresh / Logout ─────────────────────────

    @Transactional
    public AuthResult refresh(String rawRefresh, String ip, String userAgent) {
        RefreshTokenService.Rotation rot = refreshTokens.rotate(rawRefresh, ip, userAgent);
        AppUser user = userRepo.findById(rot.userId())
                .filter(u -> !u.isDeleted())
                .orElseThrow(() -> ApiException.unauthorized("invalid_refresh",
                        "Сессия истекла. Войдите снова."));
        Entitlement entitlement = entitlements.forUser(user.getId());
        JwtService.AccessToken access = jwtService.issue(user, entitlement);
        return new AuthResult(access, rot.newRawToken(), UserDto.from(user, entitlement));
    }

    public void logout(String rawRefresh) {
        if (rawRefresh != null) {
            refreshTokens.revoke(rawRefresh);
        }
    }

    // ───────────────────────── Email verify / resend ─────────────────────────

    @Transactional
    public void verifyEmail(String token) {
        Long userId = verificationTokens.consume(token, TokenType.EMAIL_VERIFY);
        AppUser user = userRepo.findById(userId)
                .orElseThrow(() -> ApiException.badRequest("invalid_token", "Ссылка недействительна или устарела."));
        user.setEmailVerified(true);
        userRepo.save(user);
    }

    @Transactional
    public void resendVerification(String email, String ip) {
        if (!rateLimiter.allow("resend:ip:" + ip, MAIL_REQUESTS_PER_IP_HOURLY, Duration.ofHours(1))
                || !rateLimiter.allow("resend:email:" + normalize(email), MAIL_PER_ADDRESS_HOURLY, Duration.ofHours(1))) {
            throw ApiException.tooManyRequests("Слишком много запросов. Попробуйте позже.");
        }
        userRepo.findByEmailAndIsDeletedFalse(normalize(email)).ifPresent(u -> {
            if (!u.isEmailVerified()) {
                String token = verificationTokens.issue(u.getId(), TokenType.EMAIL_VERIFY);
                emailService.sendVerification(u.getEmail(), token);
            }
        });
    }

    // ───────────────────────── Password reset ─────────────────────────

    @Transactional
    public void forgotPassword(String email, String ip) {
        if (!rateLimiter.allow("forgot:ip:" + ip, MAIL_REQUESTS_PER_IP_HOURLY, Duration.ofHours(1))
                || !rateLimiter.allow("forgot:email:" + normalize(email), MAIL_PER_ADDRESS_HOURLY, Duration.ofHours(1))) {
            throw ApiException.tooManyRequests("Слишком много запросов. Попробуйте позже.");
        }
        userRepo.findByEmailAndIsDeletedFalse(normalize(email)).ifPresent(u -> {
            String token = verificationTokens.issue(u.getId(), TokenType.PASSWORD_RESET);
            emailService.sendPasswordReset(u.getEmail(), token);
        });
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest req) {
        if (security.breachCheckEnabled() && pwned.isBreached(req.password())) {
            throw ApiException.badRequest("weak_password",
                    "Этот пароль встречался в утечках данных. Выберите другой.");
        }
        Long userId = verificationTokens.consume(req.token(), TokenType.PASSWORD_RESET);
        AppUser user = userRepo.findById(userId)
                .orElseThrow(() -> ApiException.badRequest("invalid_token", "Ссылка недействительна или устарела."));
        user.setPasswordHash(encoder.encode(req.password()));
        user.setPasswordChangedAt(Instant.now());
        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        userRepo.save(user);
        // Reset invalidates every active session.
        refreshTokens.revokeAllForUser(userId);
        log.info("Password reset for user id={}; all sessions revoked", userId);
    }

    // ───────────────────────── Current user ─────────────────────────

    public UserDto getUser(Long id) {
        return userRepo.findById(id)
                .filter(u -> !u.isDeleted())
                .map(u -> UserDto.from(u, entitlements.forUser(u.getId())))
                .orElseThrow(() -> ApiException.unauthorized("unauthorized", "Вы не вошли в аккаунт."));
    }

    // ───────────────────────── Helpers ─────────────────────────

    private AuthResult issueTokens(AppUser user, String ip, String userAgent) {
        Entitlement entitlement = entitlements.forUser(user.getId());
        JwtService.AccessToken access = jwtService.issue(user, entitlement);
        String refresh = refreshTokens.startSession(user.getId(), ip, userAgent);
        return new AuthResult(access, refresh, UserDto.from(user, entitlement));
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeProvider(String provider) {
        String value = provider == null ? "" : provider.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "google", "microsoft", "apple" -> value;
            default -> throw ApiException.badRequest("unsupported_provider", "Этот способ входа не поддерживается.");
        };
    }

    private static String providerLabel(String provider) {
        return switch (provider) {
            case "google" -> "Google";
            case "microsoft" -> "Microsoft";
            case "apple" -> "Apple";
            default -> "Social";
        };
    }

    private static String displayName(String provided, String email) {
        if (provided != null && !provided.isBlank()) {
            return provided.trim();
        }
        int at = email.indexOf('@');
        return at > 0 ? email.substring(0, at) : email;
    }
}
