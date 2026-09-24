"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Home, Search, User } from "lucide-react";
import styles from "./MobileTabBar.module.css";

/**
 * Phone-primary navigation: a fixed bottom tab bar.
 *
 * On a phone the top of the screen is the part a thumb cannot reach, so the
 * four destinations people actually use live at the bottom instead of behind a
 * hamburger. The bar is hidden by CSS on every larger surface and on TV, where
 * the top nav is the primary path — so it costs those layouts nothing.
 *
 * Search is a button rather than a route because there is no dedicated search
 * page: it opens the nav's search field and focuses it, which is the same
 * destination the top bar offers and one tap closer.
 */

export default function MobileTabBar({
  searchOpen,
  onSearch,
}: {
  searchOpen: boolean;
  onSearch: () => void;
}) {
  const pathname = usePathname() ?? "";

  // While the search field is open it owns the active state — otherwise two
  // tabs would look selected at once.
  const isActive = (href: string) =>
    !searchOpen && (href === "/stream" ? pathname === "/stream" : pathname.startsWith(href));

  return (
    <nav className={styles.bar} role="navigation" aria-label="Primary">
      <Link
        href="/stream"
        className={styles.tab}
        aria-current={isActive("/stream") ? "page" : undefined}
      >
        <Home size={22} aria-hidden="true" />
        <span className={styles.label}>Home</span>
      </Link>

      <button
        type="button"
        className={styles.tab}
        aria-expanded={searchOpen}
        onClick={onSearch}
      >
        <Search size={22} aria-hidden="true" />
        <span className={styles.label}>Search</span>
      </button>

      <Link
        href="/mylist"
        className={styles.tab}
        aria-current={isActive("/mylist") ? "page" : undefined}
      >
        <Bookmark size={22} aria-hidden="true" />
        <span className={styles.label}>My List</span>
      </Link>

      <Link
        href="/profile"
        className={styles.tab}
        aria-current={isActive("/profile") ? "page" : undefined}
      >
        <User size={22} aria-hidden="true" />
        <span className={styles.label}>Profile</span>
      </Link>
    </nav>
  );
}
