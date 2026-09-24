"use client";

import Link from "next/link";
import { Flame, Globe, MessageCircle, Send } from "lucide-react";
import styles from "@/app/stream/stream.module.css";

/**
 * Site footer: one column on a phone (and padded clear of the bottom tab bar),
 * two-up from tablet, and reduced to the legal line on TV — see the FOOTER
 * block in stream.module.css.
 *
 * The links are spelled out rather than derived from NAV_ITEMS because that
 * list still carries placeholder hash hrefs, which resolve to nothing on
 * /profile or /anime/[id] where this footer also renders.
 */
const BROWSE = [
  { label: "Главная", href: "/stream" },
  { label: "Каталог", href: "/stream?view=catalog" },
  { label: "Жанры", href: "/stream?view=genres" },
  { label: "Моё", href: "/mylist" },
];

const ACCOUNT = [
  { label: "Профиль", href: "/profile" },
  { label: "Подписка", href: "/profile?tab=subscription" },
  { label: "Активность", href: "/profile?tab=activity" },
];

export default function StreamFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <Link href="/stream" className={styles.logo}>
              <span className={styles.logoMark}>
                <Flame size={18} fill="currentColor" />
              </span>
              <span className={styles.logoText}>Anifire</span>
            </Link>
            <p>
              Смотрите лучшее аниме в HD с субтитрами и озвучкой на разных языках.
              Демо-версия стримингового сервиса на Next.js, Spring Boot и PostgreSQL.
            </p>
          </div>

          <div className={styles.footerCols}>
            <div>
              <h3>Обзор</h3>
              {BROWSE.map((item) => (
                <Link key={item.label} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
            <div>
              <h3>Аккаунт</h3>
              {ACCOUNT.map((item) => (
                <Link key={item.label} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>© 2026 Anifire Streaming. Все права защищены.</p>
          <div className={styles.footerSocials}>
            <Link href="/" aria-label="Telegram">
              <Send size={17} />
            </Link>
            <Link href="/" aria-label="Discord">
              <MessageCircle size={17} />
            </Link>
            <Link href="/" aria-label="Сайт">
              <Globe size={17} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
