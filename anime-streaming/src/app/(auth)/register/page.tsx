"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import { ArrowLeft, ArrowRight, Flame, Lock, Mail, MailCheck, User } from "lucide-react";
import Field from "@/components/auth/Field";
import PasswordStrength, { passwordRules } from "@/components/auth/PasswordStrength";
import SocialButtons, { type Provider } from "@/components/auth/SocialButtons";
import { useAuth } from "@/components/auth/AuthProvider";
import { register, AuthError } from "@/lib/auth-client";
import styles from "../auth.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, login, socialLogin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);

  const ready =
    EMAIL_RE.test(email) && passwordRules(password).every((rule) => rule.ok);

  useEffect(() => {
    if (!loading && user) router.replace("/stream");
  }, [loading, router, user]);

  // Staggered entrance. Skipped entirely for reduced-motion users, who get the
  // finished layout with no movement at all.
  useEffect(() => {
    const root = cardRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-rise]", {
        y: 18,
        opacity: 0,
        duration: 0.5,
        stagger: 0.07,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    }, root);
    return () => ctx.revert();
  }, [sentTo]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const displayName = String(data.get("name") ?? "");
    setBusy(true);
    setNotice(null);
    try {
      await register({ email, password, displayName });
      // Dev: accounts are auto-verified, so sign straight in. If sign-in fails
      // (e.g. email verification is enforced), fall back to the confirmation
      // screen instead of stranding the user on a spinner.
      try {
        await login(email, password);
        // Hold the success state briefly so the button morph is visible before
        // the route swap tears the form down.
        setDone(true);
        window.setTimeout(() => router.replace("/stream"), 620);
      } catch {
        setBusy(false);
        setSentTo(email);
      }
    } catch (err) {
      setBusy(false);
      if (err instanceof AuthError) {
        setNotice(err.fields?.password ?? err.fields?.email ?? err.message);
      } else {
        setNotice("Что-то пошло не так. Попробуйте ещё раз.");
      }
    }
  }

  async function handleProvider(provider: Provider, idToken: string, nonce: string) {
    setBusy(true);
    setNotice(null);
    try {
      await socialLogin(provider, idToken, nonce);
      router.replace("/stream");
    } catch (err) {
      setBusy(false);
      setNotice(err instanceof AuthError ? err.message : "Не удалось зарегистрироваться через соцсеть. Попробуйте ещё раз.");
    }
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || busy) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }

  if (sentTo) {
    return (
      <div className={styles.card} ref={cardRef}>
        <Link href="/" className={styles.logoLink} data-rise>
          <span className={styles.logoMark}>
            <Flame size={18} fill="currentColor" />
          </span>
          <span className={styles.logoText}>Anifire</span>
        </Link>
        <span className={styles.sentIcon} data-rise>
          <MailCheck size={28} />
        </span>
        <h1 className={styles.head} data-rise>Подтвердите почту</h1>
        <p className={styles.sub} data-rise>
          Мы отправили письмо со ссылкой на <strong>{sentTo}</strong>. Откройте его, подтвердите
          адрес и войдите. Письма нет? Проверьте «Спам».
        </p>
        <Link href="/login" className={styles.back} data-rise>
          <ArrowLeft size={16} /> Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.card} ref={cardRef}>
      <span className={styles.cardAura} aria-hidden="true" />

      <Link href="/" className={styles.logoLink} data-rise>
        <span className={styles.logoMark}>
          <Flame size={18} fill="currentColor" />
        </span>
        <span className={styles.logoText}>Anifire</span>
      </Link>

      <h1 className={styles.head} data-rise>
        Создайте аккаунт
      </h1>
      <p className={styles.sub} data-rise>
        Начните смотреть меньше чем за минуту. Без карты и без рекламы на бесплатном тарифе.
      </p>

      {notice ? (
        <div className={`${styles.notice} ${styles.noticeErr}`} role="alert">
          {notice}
        </div>
      ) : null}

      <div data-rise>
        <SocialButtons onCredential={handleProvider} disabled={busy} onError={setNotice} />
      </div>

      <div className={styles.divider} data-rise>
        или зарегистрируйтесь по email
      </div>

      <form className={styles.form} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <div data-rise>
          <Field
            id="name"
            label="Имя"
            icon={<User size={17} />}
            autoComplete="name"
            required={false}
          />
        </div>

        <div data-rise>
          <Field
            id="email"
            label="Почта"
            type="email"
            icon={<Mail size={17} />}
            autoComplete="email"
            value={email}
            onValueChange={setEmail}
            validate={(v) =>
              v.length === 0
                ? "Введите email"
                : EMAIL_RE.test(v)
                  ? null
                  : "Похоже, адрес email указан не полностью"
            }
          />
        </div>

        <div data-rise>
          <Field
            id="password"
            label="Пароль"
            type="password"
            icon={<Lock size={17} />}
            autoComplete="new-password"
            value={password}
            onValueChange={setPassword}
            validate={(v) =>
              passwordRules(v).every((rule) => rule.ok)
                ? null
                : "Пароль не соответствует требованиям ниже"
            }
            hint={<PasswordStrength value={password} />}
          />
        </div>

        <p className={styles.terms} data-rise>
          Создавая аккаунт, вы соглашаетесь с <a href="#terms">Условиями использования</a> и{" "}
          <a href="#privacy">Политикой конфиденциальности</a>.
        </p>

        <button
          className={styles.submit}
          type="submit"
          disabled={busy || !ready}
          data-state={done ? "done" : busy ? "busy" : ready ? "ready" : "idle"}
          data-rise
        >
          <span className={styles.submitLabel}>
            {done ? "Добро пожаловать" : busy ? "Создаём аккаунт" : "Создать аккаунт"}
            {!busy && !done ? <ArrowRight size={17} /> : null}
          </span>
          {busy && !done ? <span className={styles.spinner} /> : null}
        </button>
      </form>

      <p className={styles.alt} data-rise>
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>
    </div>
  );
}
