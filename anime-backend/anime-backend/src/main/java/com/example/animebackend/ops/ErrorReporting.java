package com.example.animebackend.ops;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import io.sentry.Sentry;
import io.sentry.logback.SentryAppender;
import jakarta.annotation.PreDestroy;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Ships every ERROR log line (with its stack trace) to Sentry — or any
 * Sentry-compatible collector such as GlitchTip — when {@code SENTRY_DSN} is set.
 * Without a DSN nothing is initialised and nothing leaves the process.
 *
 * Going through logging rather than a web-framework integration covers every
 * failure path the same way: request handlers (GlobalExceptionHandler logs
 * unhandled exceptions at ERROR), scheduled jobs, mail delivery and imports.
 */
@Component
public class ErrorReporting {

    private static final org.slf4j.Logger log = LoggerFactory.getLogger(ErrorReporting.class);
    private static final java.util.regex.Pattern EMAIL =
            java.util.regex.Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");

    private final boolean enabled;

    public ErrorReporting(
            @Value("${anifire.sentry.dsn:${SENTRY_DSN:}}") String dsn,
            @Value("${anifire.sentry.release:${SENTRY_RELEASE:}}") String release,
            Environment env) {
        this.enabled = dsn != null && !dsn.isBlank();
        if (!enabled) return;

        Sentry.init(options -> {
            options.setDsn(dsn);
            options.setEnvironment(env.getActiveProfiles().length > 0 ? env.getActiveProfiles()[0] : "dev");
            if (release != null && !release.isBlank()) options.setRelease(release);
            // Emails, IPs and cookies stay out of third-party storage. Log lines
            // often name the account ("Mail delivery failed to=…"), so addresses
            // in the message are masked before the event leaves the process.
            options.setSendDefaultPii(false);
            options.setBeforeSend((event, hint) -> {
                if (event.getMessage() != null && event.getMessage().getFormatted() != null) {
                    event.getMessage().setFormatted(EMAIL.matcher(event.getMessage().getFormatted()).replaceAll("[email]"));
                }
                if (event.getMessage() != null && event.getMessage().getMessage() != null) {
                    event.getMessage().setMessage(EMAIL.matcher(event.getMessage().getMessage()).replaceAll("[email]"));
                }
                return event;
            });
        });

        LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
        SentryAppender appender = new SentryAppender();
        appender.setContext(context);
        appender.setName("SENTRY");
        appender.setMinimumEventLevel(Level.ERROR);
        appender.setMinimumBreadcrumbLevel(Level.INFO);
        appender.start();
        context.getLogger(Logger.ROOT_LOGGER_NAME).addAppender(appender);
        log.info("Error reporting enabled (Sentry-compatible DSN configured)");
    }

    @PreDestroy
    void flush() {
        if (enabled) Sentry.flush(2000);
    }
}
