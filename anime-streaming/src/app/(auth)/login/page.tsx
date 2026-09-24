"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Flame, Lock, Mail } from "lucide-react";
import Field from "@/components/auth/Field";
import SocialButtons, { type Provider } from "@/components/auth/SocialButtons";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthError } from "@/lib/auth-client";
import styles from "../auth.module.css";

type Busy = null | "email" | Provider;

/**
 * Where to land after signing in. Only a same-origin path is accepted: `//evil`
 * and `/\evil` are protocol-relative URLs in a browser, and a `next` that parses
 * to another origin is an open redirect — the classic phishing pivot off a login
 * page. Anything suspicious falls back to the catalogue.
 */
function nextPath() {
  if (typeof window === "undefined") return "/stream";
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/stream";
  }
  const resolved = new URL(value, window.location.origin);
  return resolved.origin === window.location.origin
    ? `${resolved.pathname}${resolved.search}${resolved.hash}`
    : "/stream";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login, socialLogin } = useAuth();
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(nextPath());
  }, [loading, router, user]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    setBusy("email");
    setNotice(null);
    try {
      await login(email, password);
      router.replace(nextPath());
    } catch (err) {
      setBusy(null);
      setNotice(err instanceof AuthError ? err.message : "Something went wrong. Try again.");
    }
  }

  async function handleProvider(provider: Provider, idToken: string, nonce: string) {
    setBusy(provider);
    setNotice(null);
    try {
      await socialLogin(provider, idToken, nonce);
      router.replace(nextPath());
    } catch (err) {
      setBusy(null);
      setNotice(err instanceof AuthError ? err.message : "Social sign-in failed. Try again.");
    }
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || busy !== null) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }

  return (
    <div className={styles.card}>
      <Link href="/" className={styles.logoLink}>
        <span className={styles.logoMark}>
          <Flame size={18} fill="currentColor" />
        </span>
        <span className={styles.logoText}>Anifire</span>
      </Link>

      <h1 className={styles.head}>Welcome back</h1>
      <p className={styles.sub}>Sign in to pick up where you left off.</p>

      {notice ? (
        <div className={`${styles.notice} ${styles.noticeInfo}`}>{notice}</div>
      ) : null}

      <SocialButtons
        onCredential={handleProvider}
        disabled={busy === "email"}
        onError={setNotice}
      />

      <div className={styles.divider}>or continue with email</div>

      <form className={styles.form} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <Field
          id="email"
          label="Email"
          type="email"
          icon={<Mail size={17} />}
          autoComplete="email"
        />
        <Field
          id="password"
          label="Password"
          type="password"
          icon={<Lock size={17} />}
          autoComplete="current-password"
        />

        <div className={styles.row}>
          <label className={styles.check}>
            <input type="checkbox" defaultChecked />
            <span className={styles.checkBox}>
              <Check size={13} strokeWidth={3} />
            </span>
            Remember me
          </label>
          <Link href="/forgot-password" className={styles.link}>
            Forgot password?
          </Link>
        </div>

        <button className={styles.submit} type="submit" disabled={busy !== null}>
          {busy === "email" ? <span className={styles.spinner} /> : "Sign in"}
        </button>
      </form>

      <p className={styles.alt}>
        New to Anifire? <Link href="/register">Create an account</Link>
      </p>
    </div>
  );
}
