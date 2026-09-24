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
  { label: "Home", href: "/stream" },
  { label: "Catalog", href: "/stream?view=catalog" },
  { label: "Genres", href: "/stream?view=genres" },
  { label: "My List", href: "/mylist" },
];

const ACCOUNT = [
  { label: "Profile", href: "/profile" },
  { label: "Subscription", href: "/profile?tab=subscription" },
  { label: "Activity", href: "/profile?tab=activity" },
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
              Stream the best anime in HD with multi-language subtitles and dubs. A
              demo streaming front end built on Next.js, Spring Boot and PostgreSQL.
            </p>
          </div>

          <div className={styles.footerCols}>
            <div>
              <h3>Browse</h3>
              {BROWSE.map((item) => (
                <Link key={item.label} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
            <div>
              <h3>Account</h3>
              {ACCOUNT.map((item) => (
                <Link key={item.label} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>© 2026 Anifire Streaming. All rights reserved.</p>
          <div className={styles.footerSocials}>
            <Link href="/" aria-label="Telegram">
              <Send size={17} />
            </Link>
            <Link href="/" aria-label="Discord">
              <MessageCircle size={17} />
            </Link>
            <Link href="/" aria-label="Website">
              <Globe size={17} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
