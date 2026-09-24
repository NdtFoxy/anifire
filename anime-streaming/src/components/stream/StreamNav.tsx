"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  CreditCard,
  Flame,
  LogOut,
  Menu,
  Search,
  Shield,
  User as UserIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useDevice } from "@/components/system/DeviceProvider";
import MobileTabBar from "@/components/system/MobileTabBar";
import TvModeToggle from "@/components/system/TvModeToggle";
import { NAV_ITEMS } from "@/data/mockAnime";
import styles from "@/app/stream/stream.module.css";

/**
 * Shared top navigation for the streaming experience — used on /stream,
 * /anime/[id], /mylist and /profile.
 *
 * It changes shape rather than just shrinking:
 *   phone      logo + search, with the four primary destinations moved to the
 *              bottom tab bar (thumbs live down there) and only genuinely
 *              secondary links left in the drawer.
 *   tablet     inline links and an inline search field; no drawer.
 *   laptop+    the full bar, capped by the shell tokens, shrinking on scroll.
 *   ultrawide  same bar with its content capped at --shell-max and centred, so
 *              the logo and the avatar never end up a metre apart.
 *   TV         large pills, overscan padding, click/Enter-driven menus. Keyed
 *              off html[data-device="tv"], never off a viewport width.
 *
 * The tab bar is mounted here rather than in app/layout.tsx on purpose: its
 * Search tab drives *this* component's search field, so mounting it globally
 * would mean lifting the query state into a provider for no gain. StreamNav
 * already renders on every content page, and the pages that deliberately have
 * no app chrome (/login, /admin) also want no phone tab bar.
 */
export default function StreamNav() {
  const [scrolled, setScrolled] = useState(false);
  /**
   * Everything transient (drawer, profile menu, search) belongs to the route it
   * was opened on: a route change simply makes the stored panel state stale
   * instead of an effect having to close the panels.
   */
  const [panels, setPanels] = useState<{
    path: string;
    open: boolean;
    menuOpen: boolean;
    searchOpen: boolean;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { user, logout } = useAuth();
  const { input } = useDevice();

  // Map the placeholder hash links to real in-app views.
  const navHref = (href: string) => {
    if (href === "#catalog") return "/stream?view=catalog";
    if (href === "#genres") return "/stream?view=genres";
    if (href === "#my-list") return "/mylist";
    return href;
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * The global skip link points at #main. Every page in this app owns a
   * <main id="main">, but a page that has not been converted yet would leave
   * the link dangling — so stamp the id onto the first <main> we find instead
   * of shipping a control that goes nowhere.
   */
  useEffect(() => {
    if (document.getElementById("main")) return;
    const main = document.querySelector("main");
    if (main) main.id = "main";
  }, [pathname]);

  const closed = { path: pathname, open: false, menuOpen: false, searchOpen: false };
  const live = panels && panels.path === pathname ? panels : closed;
  const { open, menuOpen, searchOpen } = live;

  /**
   * Panel setters keep the familiar `setX(value | updater)` shape but write into
   * the route-scoped record, and they read the previous value from the updater
   * argument so two panels can be changed in one event handler.
   */
  type Panels = typeof closed;
  const patch = useCallback(
    (
      key: "open" | "menuOpen" | "searchOpen",
      value: boolean | ((prev: boolean) => boolean)
    ) =>
      setPanels((cur: Panels | null) => {
        const base =
          cur && cur.path === pathname
            ? cur
            : { path: pathname, open: false, menuOpen: false, searchOpen: false };
        return {
          ...base,
          [key]: typeof value === "function" ? value(base[key]) : value,
        };
      }),
    [pathname]
  );
  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => patch("open", value),
    [patch]
  );
  const setMenuOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => patch("menuOpen", value),
    [patch]
  );
  const setSearchOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => patch("searchOpen", value),
    [patch]
  );

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Close the profile dropdown on outside click, Escape or the remote's Back
  // button. Both keys are swallowed: SpatialNav maps them to history.back(),
  // and dismissing an open menu is what the user actually asked for.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "GoBack" && e.key !== "BrowserBack") return;
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(false);
      avatarRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, setMenuOpen]);

  // Same contract for the phone drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "GoBack" && e.key !== "BrowserBack") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // On a remote there is no pointer to land in the menu, so move focus for it.
  useEffect(() => {
    if (!menuOpen || input !== "remote") return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen, input]);

  async function handleLogout() {
    setMenuOpen(false);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  function submitSearch() {
    const q = searchQuery.trim();
    router.push(
      q ? `/stream?view=catalog&q=${encodeURIComponent(q)}` : "/stream?view=catalog"
    );
    setSearchOpen(false);
  }

  return (
    <div className={styles.navRoot}>
      <a href="#main" className="skipLink">
        Skip to content
      </a>

      <header className={`${styles.nav} ${scrolled || open ? styles.navSolid : ""}`}>
        <div
          className={`${styles.navInner} ${searchOpen ? styles.navInnerSearching : ""}`}
        >
          <div className={styles.navLeft}>
            <Link href="/stream" className={styles.logo}>
              <span className={styles.logoMark}>
                <Flame size={18} fill="currentColor" />
              </span>
              <span className={styles.logoText}>Anifire</span>
            </Link>
            <nav className={styles.navLinks} aria-label="Sections">
              {NAV_ITEMS.map((item) => {
                const target = navHref(item.href);
                // A query-only destination (?view=genres) cannot be told apart
                // from the plain route by pathname, so it claims no current state.
                const current =
                  !target.includes("?") &&
                  (target === "/stream" ? pathname === "/stream" : pathname.startsWith(target));
                return (
                  <Link
                    key={item.label}
                    href={target}
                    className={styles.navLink}
                    aria-current={current ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
              {user?.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  className={styles.navLink}
                  aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                >
                  Admin
                </Link>
              ) : null}
            </nav>
          </div>

          <div className={styles.navRight}>
            <form
              className={`${styles.searchBox} ${searchOpen ? styles.searchBoxOpen : ""}`}
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch();
              }}
            >
              <button
                className={styles.iconBtn}
                type="button"
                aria-label={searchOpen ? "Submit search" : "Search"}
                aria-expanded={searchOpen}
                onClick={() => {
                  if (searchOpen && searchQuery.trim()) submitSearch();
                  else setSearchOpen((v) => !v);
                }}
              >
                <Search size={18} />
              </button>
              <input
                ref={searchRef}
                className={styles.searchInput}
                placeholder="Search anime…"
                value={searchQuery}
                // Collapsed the field is 0px wide; keeping it tabbable would
                // trap keyboard and remote users on an invisible control.
                tabIndex={searchOpen ? undefined : -1}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  e.stopPropagation();
                  setSearchOpen(false);
                }}
                aria-label="Search anime"
              />
            </form>

            <button
              className={`${styles.iconBtn} ${styles.mobileBtn}`}
              type="button"
              aria-label="More"
              aria-expanded={open}
              aria-controls="nav-drawer"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>

            <div className={styles.profileWrap} ref={menuRef}>
              <button
                ref={avatarRef}
                type="button"
                className={styles.avatar}
                aria-label="Profile menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <Flame size={16} fill="currentColor" />
              </button>
              {menuOpen ? (
                <div className={styles.profileMenu} role="menu">
                  {user ? (
                    <div className={styles.profileHead}>
                      <span className={styles.profileName}>
                        {user.displayName || user.email?.split("@")[0]}
                      </span>
                      <span className={styles.profileEmail}>{user.email}</span>
                    </div>
                  ) : null}
                  <Link
                    href="/profile"
                    className={styles.profileItem}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <UserIcon size={16} /> Profile
                  </Link>
                  <Link
                    href="/profile?tab=subscription"
                    className={styles.profileItem}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <CreditCard size={16} /> Subscription
                  </Link>
                  {user?.role === "ADMIN" ? (
                    <Link
                      href="/admin"
                      className={styles.profileItem}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Shield size={16} /> Admin
                    </Link>
                  ) : null}
                  {user ? (
                    <button
                      type="button"
                      className={`${styles.profileItem} ${styles.profileDanger}`}
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      <LogOut size={16} /> Log out
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      className={styles.profileItem}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      <LogOut size={16} /> Sign in
                    </Link>
                  )}
                  <TvModeToggle />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Phone drawer: only what the bottom tab bar does not already cover. */}
      <div
        id="nav-drawer"
        className={`${styles.mobileMenu} ${open ? styles.mobileMenuOpen : ""}`}
      >
        <div className={styles.mobileInner}>
          {NAV_ITEMS.filter((item) => item.href !== "/stream" && item.href !== "#my-list").map(
            (item) => (
              <Link
                key={item.label}
                href={navHref(item.href)}
                className={styles.mobileLink}
                onClick={() => setOpen(false)}
              >
                {item.label}
                <ChevronRight size={18} />
              </Link>
            )
          )}
          {user?.role === "ADMIN" ? (
            <Link href="/admin" className={styles.mobileLink} onClick={() => setOpen(false)}>
              Admin
              <ChevronRight size={18} />
            </Link>
          ) : null}
          <Link
            href="/profile?tab=subscription"
            className={styles.mobileLink}
            onClick={() => setOpen(false)}
          >
            Subscription
            <ChevronRight size={18} />
          </Link>
          {user ? (
            <button
              type="button"
              className={styles.mobileLink}
              onClick={() => {
                setOpen(false);
                handleLogout();
              }}
            >
              Log out
              <LogOut size={18} />
            </button>
          ) : (
            <Link href="/login" className={styles.mobileLink} onClick={() => setOpen(false)}>
              Sign in
              <ChevronRight size={18} />
            </Link>
          )}
        </div>
      </div>

      <MobileTabBar
        searchOpen={searchOpen}
        onSearch={() => {
          setOpen(false);
          setSearchOpen(true);
          searchRef.current?.focus();
        }}
      />
    </div>
  );
}
