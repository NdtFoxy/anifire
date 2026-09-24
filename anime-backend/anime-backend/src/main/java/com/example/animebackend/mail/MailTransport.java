package com.example.animebackend.mail;

import jakarta.mail.internet.MimeMessage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Delivers a rendered {@link MailMessage} off the request thread.
 *
 * Sending is deferred for two reasons. SMTP round-trips take hundreds of
 * milliseconds, and "register with an existing email" (which sends a notice) must
 * take as long as a fresh registration, or the response time tells an attacker
 * which addresses have accounts. And when called inside a transaction the send
 * waits for the commit, so a rolled-back registration never mails out a token
 * that does not exist.
 */
@Component
public class MailTransport {

    private static final Logger log = LoggerFactory.getLogger(MailTransport.class);

    private final MailProperties props;
    private final ObjectProvider<JavaMailSender> sender;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public MailTransport(MailProperties props, ObjectProvider<JavaMailSender> sender) {
        this.props = props;
        this.sender = sender;
    }

    public void send(MailMessage message) {
        Runnable task = () -> executor.execute(() -> deliver(message));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    private void deliver(MailMessage message) {
        JavaMailSender mailer = props.enabled() ? sender.getIfAvailable() : null;
        if (mailer == null) {
            // Development fallback only: this prints the action link, so it must
            // never be the path taken in production (StartupSafetyCheck enforces it).
            log.info("[mail disabled] to={} subject=\"{}\"\n{}", message.to(), message.subject(), message.text());
            return;
        }
        try {
            MimeMessage mime = mailer.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, "UTF-8");
            helper.setFrom(props.from());
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            helper.setText(message.text(), message.html());
            mailer.send(mime);
            log.info("Mail sent to={} subject=\"{}\"", message.to(), message.subject());
        } catch (Exception e) {
            // The body carries a one-time token; log the failure, not the content.
            log.error("Mail delivery failed to={} subject=\"{}\": {}", message.to(), message.subject(), e.toString());
        }
    }
}
