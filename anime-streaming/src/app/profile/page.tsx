"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { gsap } from "gsap";
import { Loader2 } from "lucide-react";
import StreamNav from "@/components/stream/StreamNav";
import StreamFooter from "@/components/stream/StreamFooter";
import RequireAuth from "@/components/auth/RequireAuth";
import { getProfile, type Profile } from "@/lib/auth-client";
import ActivityTab from "@/components/profile/ActivityTab";
import BookmarksTab from "@/components/profile/BookmarksTab";
import IdentityHeader from "@/components/profile/IdentityHeader";
import OverviewTab from "@/components/profile/OverviewTab";
import SubscriptionTab from "@/components/profile/SubscriptionTab";
import { ErrorState, Skeleton } from "@/components/profile/states";
import FriendsTab from "@/components/profile/FriendsTab";
import VocabularyTab from "@/components/profile/VocabularyTab";
import { useResource } from "@/components/profile/useResource";
import styles from "./profile.module.css";

const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "bookmarks", label: "Закладки" },
  { key: "activity", label: "Активность" },
  { key: "friends", label: "Друзья" },
  { key: "vocabulary", label: "Словарь" },
  { key: "subscription", label: "Подписка" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ProfileContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mainRef = useRef<HTMLDivElement>(null);

  const requested = params.get("tab");
  const active: TabKey = TABS.some((t) => t.key === requested)
    ? (requested as TabKey)
    : "overview";

  const profile = useResource<Profile>(async () => {
    // `getProfile` resolves to null instead of throwing; turn that back into a
    // real failure so the error state (and its retry) actually shows up.
    const p = await getProfile();
    if (!p) throw new Error("Сервер не вернул данные профиля.");
    return p;
  });

  const { data, loading } = profile;

  useEffect(() => {
    if (loading || !data || !mainRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Tabs that fetch their own data are still skeletons here; animating nothing
    // only logs GSAP warnings, and their content simply appears when it lands.
    const targets = mainRef.current.querySelectorAll("[data-rise]");
    if (targets.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.06, duration: 0.45, ease: "power2.out" }
      );
    }, mainRef);
    return () => ctx.revert();
  }, [loading, data, active]);

  function selectTab(key: TabKey) {
    const next = new URLSearchParams(params.toString());
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <StreamNav />
        <main id="main" className={styles.loading}>
          <Loader2 size={26} className={styles.spin} />
          <span>Загружаем профиль…</span>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <StreamNav />
        <div className={styles.shell}>
          <main id="main" className={styles.errorWrap}>
            <ErrorState
              message={profile.error ?? "Не удалось загрузить профиль."}
              onRetry={profile.reload}
              retrying={loading}
            />
          </main>
        </div>
        <div className={styles.footerWrap}>
          <StreamFooter />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <StreamNav />

      <IdentityHeader profile={data} onProfile={profile.set} />

      <div className={styles.shell}>
        <nav className={styles.tabs} aria-label="Разделы профиля">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${active === tab.key ? styles.tabOn : ""}`}
              aria-current={active === tab.key ? "page" : undefined}
              onClick={() => selectTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main id="main" className={styles.panel} ref={mainRef}>
          {active === "overview" ? (
            <OverviewTab profile={data} onProfile={profile.set} />
          ) : active === "bookmarks" ? (
            <BookmarksTab />
          ) : active === "activity" ? (
            <ActivityTab />
          ) : active === "friends" ? (
            <FriendsTab />
          ) : active === "vocabulary" ? (
            <VocabularyTab />
          ) : (
            <SubscriptionTab />
          )}
        </main>
      </div>

      <div className={styles.footerWrap}>
        <StreamFooter />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className={styles.page}>
            <StreamNav />
            <main id="main" className={styles.shell}>
              <Skeleton lines={4} height={40} />
            </main>
          </div>
        }
      >
        <ProfileContent />
      </Suspense>
    </RequireAuth>
  );
}
