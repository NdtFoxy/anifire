"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flame, Mail, MailCheck } from "lucide-react";
import Field from "@/components/auth/Field";
import { forgotPassword } from "@/lib/auth-client";
import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    // Backend always responds generically (no account enumeration), so we show
    // the same confirmation regardless of whether the email exists.
    await forgotPassword(email).catch(() => undefined);
    setBusy(false);
    setSentTo(email);
  }

  return (
    <div className={styles.card}>
      <Link href="/" className={styles.logoLink}>
        <span className={styles.logoMark}>
          <Flame size={18} fill="currentColor" />
        </span>
        <span className={styles.logoText}>Anifire</span>
      </Link>

      {sentTo ? (
        <>
          <span className={styles.sentIcon}>
            <MailCheck size={28} />
          </span>
          <h1 className={styles.head}>Проверьте почту</h1>
          <p className={styles.sub}>
            Если аккаунт с адресом <strong>{sentTo}</strong> существует, мы отправили на него
            ссылку для сброса пароля. Она действительна 30 минут.
          </p>
          <button
            type="button"
            className={styles.submit}
            onClick={() => setSentTo(null)}
          >
            Указать другой email
          </button>
          <Link href="/login" className={styles.back}>
            <ArrowLeft size={16} /> Вернуться ко входу
          </Link>
        </>
      ) : (
        <>
          <h1 className={styles.head}>Сброс пароля</h1>
          <p className={styles.sub}>
            Введите email, привязанный к аккаунту, и мы пришлём ссылку
            для сброса пароля.
          </p>

          <form className={styles.form} onSubmit={handleSubmit}>
            <Field
              id="email"
              label="Email"
              type="email"
              icon={<Mail size={17} />}
              autoComplete="email"
            />
            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? <span className={styles.spinner} /> : "Отправить ссылку"}
            </button>
          </form>

          <Link href="/login" className={styles.back}>
            <ArrowLeft size={16} /> Вернуться ко входу
          </Link>
        </>
      )}
    </div>
  );
}
