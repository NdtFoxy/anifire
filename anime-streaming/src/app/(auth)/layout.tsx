import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Sparkles } from "lucide-react";
import styles from "./auth.module.css";

export const metadata: Metadata = {
  title: "Anifire — Аккаунт",
  description: "Войдите или создайте аккаунт Anifire.",
};

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.wrap}>
      {/* Form first: it is what the visitor came for, and on one column it
          has to sit above the marketing panel. Grid placement puts the brand
          back on the left from laptop up. */}
      <main id="main" className={styles.panel}>
        {children}
      </main>

      {/* ───────── Brand / marketing panel ───────── */}
      <aside className={styles.brand}>
        <div className={styles.brandGrain} />
        <Flame className={styles.brandFlame} strokeWidth={1} aria-hidden="true" />

        <div className={styles.brandTop}>
          <Link href="/" className={styles.logoLink}>
            <span className={styles.logoMark}>
              <Flame size={18} fill="currentColor" />
            </span>
            <span className={styles.logoText}>Anifire</span>
          </Link>
        </div>

        <div className={styles.brandBody}>
          <span className={styles.brandEyebrow}>
            <Sparkles size={14} /> 12 000+ тайтлов · без рекламы
          </span>
          <h2 className={styles.brandHeadline}>
            Здесь каждая история <em>вспыхивает</em>.
          </h2>
          <p className={styles.brandSub}>
            Смотрите главные аниме сезона в чётком HD, собирайте свой список
            и продолжайте с того же места — на любом экране.
          </p>
        </div>

        <div className={styles.brandFooter}>
          <span>© 2026 Anifire</span>
          <a href="#privacy">Конфиденциальность</a>
          <a href="#terms">Условия</a>
        </div>
      </aside>
    </div>
  );
}
