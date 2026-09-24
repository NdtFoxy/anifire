package com.example.animebackend.ops;

import com.example.animebackend.auth.config.JwtProperties;
import com.example.animebackend.auth.config.SecurityProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Refuses to serve production traffic with development secrets.
 *
 * Every value below has a working default so that `./gradlew bootRun` needs no
 * setup — which is exactly the trap: the same defaults would silently ship. A
 * deployment that forgets `ANIFIRE_SECURITY_PEPPER` would hash every password
 * with a public constant, and one that forgets the JWK set would mint tokens with
 * a key generated fresh at each boot, logging every user out on restart.
 *
 * The check runs at ApplicationReady rather than during bean creation so the
 * message is the last thing in the log instead of being buried in a stack trace,
 * and it throws, so an orchestrator restarts (and fails) loudly instead of a
 * half-configured instance answering requests.
 *
 * "Production" means any profile that is not dev/test. Nothing here is a
 * heuristic about the environment: it is the profile the operator chose.
 */
@Component
public class StartupSafetyCheck implements ApplicationListener<ApplicationReadyEvent> {

    /** Same constant as the dev default in application.properties. */
    private static final String DEV_PEPPER = "ZGV2LW9ubHktcGVwcGVyLWNoYW5nZS1tZS1pbi1wcm9kdWN0aW9u";

    private final Environment env;
    private final SecurityProperties security;
    private final JwtProperties jwt;

    public StartupSafetyCheck(Environment env, SecurityProperties security, JwtProperties jwt) {
        this.env = env;
        this.security = security;
        this.jwt = jwt;
    }

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        List<String> active = List.of(env.getActiveProfiles());
        boolean development = active.isEmpty() || active.contains("dev") || active.contains("test");
        if (development) return;

        List<String> problems = new ArrayList<>();

        if (security.pepper() == null || security.pepper().isBlank() || DEV_PEPPER.equals(security.pepper())) {
            problems.add("anifire.security.pepper is the development default — set ANIFIRE_SECURITY_PEPPER");
        }
        if (!security.cookieSecure()) {
            problems.add("anifire.security.cookie-secure=false would send the refresh cookie over plain HTTP");
        }
        if (jwt.jwkSet() == null || jwt.jwkSet().isBlank()) {
            problems.add("anifire.jwt.jwk-set is empty — a key generated at boot invalidates every session on restart");
        }
        if (jwt.issuer() == null || jwt.issuer().endsWith(".local")) {
            problems.add("anifire.jwt.issuer points at a .local host — set the real issuer URL");
        }
        String datasourcePassword = env.getProperty("spring.datasource.password", "");
        if ("secret".equals(datasourcePassword)) {
            problems.add("spring.datasource.password is the compose default — set SPRING_DATASOURCE_PASSWORD");
        }
        if (env.getProperty("anifire.seed.enabled", Boolean.class, false)) {
            problems.add("anifire.seed.enabled=true would seed demo content into a production database");
        }
        if ("dev".equals(env.getProperty("anifire.billing.provider"))) {
            problems.add("anifire.billing.provider=dev grants subscriptions without taking money");
        }
        String shopId = env.getProperty("anifire.billing.shop-id", "");
        if ("yookassa".equals(env.getProperty("anifire.billing.provider")) && shopId.isBlank()) {
            problems.add("anifire.billing.shop-id is empty — checkout would fail for every buyer");
        }

        if (problems.isEmpty()) return;

        throw new IllegalStateException(
                "Refusing to start with development secrets in profile " + active + ":\n  - "
                        + String.join("\n  - ", problems)
                        + "\nOverride them via environment variables, or run with the dev profile.");
    }
}
