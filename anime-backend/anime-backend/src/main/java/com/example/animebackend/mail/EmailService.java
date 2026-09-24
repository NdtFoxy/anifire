package com.example.animebackend.mail;

import com.example.animebackend.auth.config.AppProperties;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

/**
 * Every email the product sends, rendered here and handed to {@link MailTransport}.
 * Russian copy to match the UI; each message has a plain-text twin because some
 * clients (and most spam filters) look at it first.
 */
@Service
public class EmailService {

    private final MailTransport transport;
    private final String frontendUrl;

    public EmailService(MailTransport transport, AppProperties app) {
        this.transport = transport;
        this.frontendUrl = app.frontendUrl();
    }

    public void sendVerification(String email, String rawToken) {
        String link = frontendUrl + "/verify-email?token=" + rawToken;
        transport.send(action(email,
                "Подтвердите почту — Anifire",
                "Добро пожаловать в Anifire!",
                "Чтобы начать смотреть, подтвердите адрес электронной почты.",
                "Подтвердить почту", link,
                "Если вы не регистрировались в Anifire, просто проигнорируйте это письмо."));
    }

    public void sendPasswordReset(String email, String rawToken) {
        String link = frontendUrl + "/reset-password?token=" + rawToken;
        transport.send(action(email,
                "Сброс пароля — Anifire",
                "Сброс пароля",
                "Мы получили запрос на смену пароля. Ссылка действует 30 минут.",
                "Задать новый пароль", link,
                "Если вы не запрашивали сброс, ничего не делайте — пароль останется прежним."));
    }

    public void sendAccountExistsNotice(String email) {
        transport.send(action(email,
                "Попытка регистрации — Anifire",
                "У вас уже есть аккаунт",
                "Кто-то попытался зарегистрироваться в Anifire с этим адресом. Если это были вы — "
                        + "просто войдите или восстановите пароль.",
                "Войти", frontendUrl + "/login",
                "Если это были не вы, ничего делать не нужно: без доступа к почте аккаунт в безопасности."));
    }

    /** One line per title: "Title — серия N", linking straight to the episode. */
    public record NewEpisode(String title, int episode, String watchPath) {}

    public void sendNewEpisodes(String email, List<NewEpisode> episodes) {
        if (episodes.isEmpty()) return;
        StringBuilder text = new StringBuilder("Вышли новые серии из ваших закладок:\n\n");
        StringBuilder items = new StringBuilder();
        for (NewEpisode e : episodes) {
            String url = frontendUrl + e.watchPath();
            text.append("• ").append(e.title()).append(" — серия ").append(e.episode())
                    .append("\n  ").append(url).append('\n');
            items.append("<li style=\"margin:0 0 10px\"><a href=\"").append(esc(url))
                    .append("\" style=\"color:#ff4d5e;text-decoration:none;font-weight:600\">")
                    .append(esc(e.title())).append("</a> — серия ").append(e.episode()).append("</li>");
        }
        String settings = frontendUrl + "/profile?tab=overview";
        text.append("\nОтключить письма: ").append(settings).append('\n');
        String subject = episodes.size() == 1
                ? "Новая серия: " + episodes.get(0).title()
                : "Новые серии: " + episodes.size() + " в ваших закладках";
        String body = "<p style=\"margin:0 0 16px\">Вышли новые серии из ваших закладок:</p>"
                + "<ul style=\"padding-left:18px;margin:0 0 20px\">" + items + "</ul>";
        transport.send(new MailMessage(email, subject, text.toString(),
                layout("Новые серии", body,
                        "<a href=\"" + esc(settings) + "\" style=\"color:#8a8a93\">Отключить письма о сериях</a>")));
    }

    private MailMessage action(String to, String subject, String heading, String lead,
                               String button, String link, String footnote) {
        String text = heading + "\n\n" + lead + "\n\n" + button + ": " + link + "\n\n" + footnote + "\n";
        String body = "<p style=\"margin:0 0 24px\">" + esc(lead) + "</p>"
                + "<a href=\"" + esc(link) + "\" style=\"display:inline-block;background:#e11d2e;color:#fff;"
                + "padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600\">" + esc(button) + "</a>"
                + "<p style=\"margin:24px 0 0;font-size:13px;color:#8a8a93\">Кнопка не работает? Откройте ссылку:<br>"
                + "<a href=\"" + esc(link) + "\" style=\"color:#8a8a93;word-break:break-all\">" + esc(link) + "</a></p>";
        return new MailMessage(to, subject, text, layout(heading, body, esc(footnote)));
    }

    private static String layout(String heading, String body, String footer) {
        return "<!doctype html><html lang=\"ru\"><body style=\"margin:0;background:#0d0d10;"
                + "font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e9e9ee\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr><td align=\"center\" style=\"padding:32px 16px\">"
                + "<table role=\"presentation\" width=\"100%\" style=\"max-width:520px;background:#16161b;border-radius:16px;padding:32px\"><tr><td>"
                + "<div style=\"font-size:20px;font-weight:700;color:#ff4d5e;margin:0 0 20px\">Anifire</div>"
                + "<h1 style=\"font-size:22px;margin:0 0 12px;color:#fff\">" + esc(heading) + "</h1>"
                + "<div style=\"font-size:15px;line-height:1.55\">" + body + "</div>"
                + "</td></tr></table>"
                + "<p style=\"font-size:12px;color:#8a8a93;max-width:520px;margin:16px auto 0\">" + footer + "</p>"
                + "</td></tr></table></body></html>";
    }

    private static String esc(String s) {
        return HtmlUtils.htmlEscape(s, "UTF-8");
    }
}
