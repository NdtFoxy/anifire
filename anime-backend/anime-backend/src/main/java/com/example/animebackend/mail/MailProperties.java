package com.example.animebackend.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Outgoing mail (prefix {@code anifire.mail}). The SMTP connection itself is the
 * standard {@code spring.mail.*}; this only decides whether to use it.
 *
 * @param enabled when false, messages are written to the log instead of sent —
 *                the test profile and any machine without an SMTP server
 * @param from    RFC 5322 sender, e.g. {@code Anifire <no-reply@anifire.ru>}
 */
@ConfigurationProperties(prefix = "anifire.mail")
public record MailProperties(boolean enabled, String from) {
}
