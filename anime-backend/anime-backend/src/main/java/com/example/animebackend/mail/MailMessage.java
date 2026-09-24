package com.example.animebackend.mail;

/** A fully rendered email: the plain-text part is the fallback for text-only clients. */
public record MailMessage(String to, String subject, String text, String html) {
}
