"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Film,
  Flame,
  Globe2,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  Users2,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import AdsSection from "@/components/admin/AdsSection";
import CatalogSection from "@/components/admin/CatalogSection";
import CatalogImportPanel from "@/components/admin/CatalogImportPanel";
import GeoSection from "@/components/admin/GeoSection";
import OverviewSection from "@/components/admin/OverviewSection";
import SignalsSection from "@/components/admin/SignalsSection";
import UsersSection from "@/components/admin/UsersSection";
import {
  createAnime,
  createCategory,
  deleteAnime,
  deleteCategory,
  fetchAdminAnalytics,
  fetchCategories,
  fetchPagedMovies,
  updateAnime,
  type AdminAnalytics,
  type AnimeFormInput,
  type Category,
} from "@/data/animeApi";
import type { Movie } from "@/data/mockAnime";
import styles from "./admin.module.css";

/**
 * Admin console: a persistent left rail with the work area on the right.
 *
 * The section lives in the URL (`?section=geo`), so a view can be linked,
 * bookmarked and reloaded. Authorisation is server-side — every endpoint used
 * here sits under `/api/v1/admin/**`, which SecurityConfig restricts to
 * ROLE_ADMIN. The client-side check below only decides what to render; it is a
 * courtesy, never the control.
 */

const SECTIONS = [
  { key: "overview", label: "Обзор", Icon: LayoutDashboard },
  { key: "catalog", label: "Каталог", Icon: Film },
  { key: "users", label: "Пользователи", Icon: Users2 },
  { key: "ads", label: "Реклама", Icon: Megaphone },
  { key: "geo", label: "Регионы", Icon: Globe2 },
  { key: "signals", label: "Сигналы", Icon: ShieldAlert },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const emptyAnime: AnimeFormInput = {
  title: "",
  description: "",
  imageUrl: "",
  rating: null,
  categoryIds: [],
};

function AdminConsole() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const requested = params.get("section") as SectionKey | null;
  const section: SectionKey = SECTIONS.some((s) => s.key === requested)
    ? (requested as SectionKey)
    : "overview";

  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<AnimeFormInput>(emptyAnime);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const isAdmin = user?.role === "ADMIN";

  const go = (key: SectionKey) =>
    router.replace(key === "overview" ? "/admin" : `/admin?section=${key}`, { scroll: false });

  // A promise chain rather than async/await: the state updates have to land in
  // a callback so that calling this from the effect below is not a synchronous
  // setState inside an effect. Still returns a promise — callers await it.
  const loadCatalog = useCallback(
    () =>
      Promise.all([
        fetchCategories(),
        fetchPagedMovies({ page, size: 8, search, categoryId }),
      ]).then(([cats, paged]) => {
        setCategories(cats);
        setMovies(paged.items);
        setTotalPages(Math.max(1, paged.totalPages));
      }),
    [categoryId, page, search]
  );

  useEffect(() => {
    if (!isAdmin) return;
    void loadCatalog();
  }, [isAdmin, loadCatalog]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAdminAnalytics().then(setAnalytics).catch(() => setNotice("Не удалось загрузить аналитику."));
  }, [isAdmin]);

  async function handleAnimeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (editingId) await updateAnime(editingId, form);
      else await createAnime(form);
      setForm(emptyAnime);
      setEditingId(null);
      await loadCatalog();
    } catch {
      setNotice("Не удалось сохранить тайтл.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCategorySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    try {
      await createCategory(name);
      setCategoryName("");
      await loadCatalog();
    } catch {
      setNotice("Не удалось создать категорию.");
    }
  }


  if (loading) {
    return <div className={styles.boot}>Загрузка…</div>;
  }

  if (!user) {
    return (
      <div className={styles.gate}>
        <h1>Панель администратора</h1>
        <p>Чтобы продолжить, войдите в аккаунт администратора.</p>
        <Link className={styles.btnPrimary} href="/login?next=%2Fadmin">
          Войти
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.gate}>
        <h1>Только для администраторов</h1>
        <p>У этого аккаунта нет доступа к панели.</p>
        <Link className={styles.btnGhost} href="/stream">
          Вернуться в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.shell} data-collapsed={collapsed}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Flame size={18} fill="currentColor" />
          </span>
          <span className={styles.brandText}>Anifire</span>
          <button
            type="button"
            className={styles.collapse}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Развернуть навигацию" : "Свернуть навигацию"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className={styles.nav} aria-label="Разделы админки">
          {SECTIONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={styles.navItem}
              data-on={section === key}
              onClick={() => go(key)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.sideFoot}>
          <Link href="/stream" className={styles.navItem}>
            <Film size={18} />
            <span>Вернуться на сайт</span>
          </Link>
          <button type="button" className={styles.navItem} onClick={() => logout()}>
            <LogOut size={18} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <h1>{SECTIONS.find((s) => s.key === section)?.label}</h1>
            <p>Вы вошли как {user.email}</p>
          </div>
          <div className={styles.who}>
            <span className={styles.avatar}>{(user.displayName ?? user.email)[0]?.toUpperCase()}</span>
            <div>
              <b>{user.displayName ?? "Администратор"}</b>
              <small>ADMIN</small>
            </div>
          </div>
        </header>

        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <main id="main" className={styles.content}>
          {section === "overview" ? (
            <OverviewSection analytics={analytics} />
          ) : section === "catalog" ? (
            <>
              <CatalogImportPanel onFinished={() => void loadCatalog()} />
            <CatalogSection
              movies={movies}
              categories={categories}
              form={form}
              editingId={editingId}
              search={search}
              categoryId={categoryId}
              page={page}
              totalPages={totalPages}
              busy={busy}
              categoryName={categoryName}
              onForm={setForm}
              onSubmit={handleAnimeSubmit}
              onEdit={(movie) => {
                setEditingId(movie.id);
                setForm({
                  // Edit the stored catalogue values, not the localized display copy.
                  title: movie.originalTitle ?? movie.title,
                  description: movie.originalDescription ?? movie.description,
                  imageUrl: movie.originalImageUrl ?? movie.imageUrl,
                  rating: Number.isFinite(Number(movie.rating)) ? Number(movie.rating) : null,
                  categoryIds: [],
                });
              }}
              onCancelEdit={() => {
                setEditingId(null);
                setForm(emptyAnime);
              }}
              onDelete={async (id) => {
                await deleteAnime(id);
                await loadCatalog();
              }}
              onSearch={(value) => {
                setPage(0);
                setSearch(value);
              }}
              onCategoryFilter={(id) => {
                setPage(0);
                setCategoryId(id);
              }}
              onPage={setPage}
              onCategoryName={setCategoryName}
              onCategorySubmit={handleCategorySubmit}
              onCategoryDelete={async (id) => {
                await deleteCategory(id);
                await loadCatalog();
              }}
              onToggleCategory={(id) =>
                setForm((cur) => ({
                  ...cur,
                  categoryIds: cur.categoryIds.includes(id)
                    ? cur.categoryIds.filter((x) => x !== id)
                    : [...cur.categoryIds, id],
                }))
              }
            />
            </>
          ) : section === "users" ? (
            <UsersSection />
          ) : section === "ads" ? (
            <AdsSection />
          ) : section === "geo" ? (
            <GeoSection />
          ) : (
            // Inspecting an account from a signal hands off to the user directory,
            // which owns the dossier drawer.
            <SignalsSection
              onInspectUser={(userId) => router.replace(`/admin?section=users&user=${userId}`)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className={styles.boot}>Загрузка…</div>}>
      <AdminConsole />
    </Suspense>
  );
}
