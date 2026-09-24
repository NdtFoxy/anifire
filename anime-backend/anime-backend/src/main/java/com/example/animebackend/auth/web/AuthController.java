package com.example.animebackend.auth.web;

import com.example.animebackend.auth.dto.AuthResponse;
import com.example.animebackend.auth.dto.EmailRequest;
import com.example.animebackend.auth.dto.ForgotPasswordRequest;
import com.example.animebackend.auth.dto.LoginRequest;
import com.example.animebackend.auth.dto.MessageResponse;
import com.example.animebackend.auth.dto.RegisterRequest;
import com.example.animebackend.auth.dto.ResetPasswordRequest;
import com.example.animebackend.auth.dto.SocialLoginRequest;
import com.example.animebackend.auth.dto.TokenRequest;
import com.example.animebackend.auth.dto.UserDto;
import com.example.animebackend.auth.security.CookieService;
import com.example.animebackend.geo.service.GeoAccessService;
import com.example.animebackend.auth.security.OidcTokenVerifier;
import com.example.animebackend.auth.security.SocialNonceService;
import com.example.animebackend.auth.security.Tokens;
import com.example.animebackend.auth.service.AuthService;
import com.example.animebackend.auth.service.AuthService.AuthResult;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final MessageResponse GENERIC =
            new MessageResponse("If the details are valid, we've sent you an email.");

    private final AuthService authService;
    private final CookieService cookieService;
    private final OidcTokenVerifier oidc;
    private final SocialNonceService nonces;
    private final GeoAccessService geo;

    public AuthController(
            AuthService authService,
            CookieService cookieService,
            OidcTokenVerifier oidc,
            SocialNonceService nonces,
            GeoAccessService geo) {
        this.authService = authService;
        this.cookieService = cookieService;
        this.oidc = oidc;
        this.nonces = nonces;
        this.geo = geo;
    }

    @PostMapping("/register")
    public ResponseEntity<MessageResponse> register(
            @Valid @RequestBody RegisterRequest body, HttpServletRequest request) {
        // Country comes from the trusted proxy header, never from the payload.
        authService.register(body, clientIp(request), geo.resolveCountry(request));
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new MessageResponse("Check your inbox to verify your account."));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest body, HttpServletRequest request) {
        AuthResult result = authService.login(body, clientIp(request), userAgent(request));
        return authedResponse(result);
    }

    @PostMapping("/social-login")
    public ResponseEntity<AuthResponse> socialLogin(
            @Valid @RequestBody SocialLoginRequest body, HttpServletRequest request) {
        AuthResult result = authService.socialLogin(body, clientIp(request), userAgent(request));
        return authedResponse(result);
    }

    /**
     * Which providers this deployment can actually verify. The client renders only
     * these, so a missing client id shows up as an unavailable button instead of a
     * dead end (or worse, a path that trusts the client).
     */
    @GetMapping("/social/providers")
    public Map<String, Boolean> socialProviders() {
        Map<String, Boolean> out = new LinkedHashMap<>();
        for (String provider : List.of("google", "microsoft", "apple")) {
            out.put(provider, oidc.available(provider));
        }
        return out;
    }

    /**
     * Issues the single-use nonce the client must pass to the provider. The signed
     * ID token has to echo it back, which is what makes a captured or
     * foreign-audience token useless here.
     */
    @PostMapping("/social/nonce")
    public Map<String, String> socialNonce() {
        return Map.of("nonce", nonces.issue());
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(HttpServletRequest request) {
        requireCsrf(request);
        String rawRefresh = cookie(request, CookieService.REFRESH_COOKIE);
        if (rawRefresh == null) {
            throw ApiException.unauthorized("invalid_refresh", "Session expired. Please sign in again.");
        }
        AuthResult result = authService.refresh(rawRefresh, clientIp(request), userAgent(request));
        return authedResponse(result);
    }

    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(HttpServletRequest request) {
        requireCsrf(request);
        authService.logout(cookie(request, CookieService.REFRESH_COOKIE));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookieService.clearRefresh().toString())
                .header(HttpHeaders.SET_COOKIE, cookieService.clearCsrf().toString())
                .body(new MessageResponse("Signed out."));
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal Jwt jwt) {
        return authService.getUser(Long.valueOf(jwt.getSubject()));
    }

    @PostMapping("/verify-email")
    public MessageResponse verifyEmail(@Valid @RequestBody TokenRequest body) {
        authService.verifyEmail(body.token());
        return new MessageResponse("Email verified. You can now sign in.");
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<MessageResponse> resend(
            @Valid @RequestBody EmailRequest body, HttpServletRequest request) {
        authService.resendVerification(body.email(), clientIp(request));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(GENERIC);
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<MessageResponse> forgot(
            @Valid @RequestBody ForgotPasswordRequest body, HttpServletRequest request) {
        authService.forgotPassword(body.email(), clientIp(request));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(GENERIC);
    }

    @PostMapping("/reset-password")
    public MessageResponse reset(@Valid @RequestBody ResetPasswordRequest body) {
        authService.resetPassword(body);
        return new MessageResponse("Password updated. Please sign in.");
    }

    // ───────────────────────── helpers ─────────────────────────

    private ResponseEntity<AuthResponse> authedResponse(AuthResult result) {
        String csrf = Tokens.random();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookieService.refreshCookie(result.refreshToken()).toString())
                .header(HttpHeaders.SET_COOKIE, cookieService.csrfCookie(csrf).toString())
                .body(result.toResponse());
    }

    /** Double-submit CSRF: the readable csrf cookie must match the X-CSRF-Token header. */
    private void requireCsrf(HttpServletRequest request) {
        String header = request.getHeader("X-CSRF-Token");
        String cookie = cookie(request, CookieService.CSRF_COOKIE);
        if (header == null || cookie == null || !Tokens.constantTimeEquals(header, cookie)) {
            throw ApiException.forbidden("csrf_failed", "CSRF validation failed.");
        }
    }

    private String cookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie c : request.getCookies()) {
            if (c.getName().equals(name)) {
                return c.getValue();
            }
        }
        return null;
    }

    private String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private String userAgent(HttpServletRequest request) {
        return request.getHeader("User-Agent");
    }
}
