"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MessageSquare, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import UserDetailDrawer from "./UserDetailDrawer";
import { fetchUsers, setUserRole, type AdminUserRow, type UserQuery } from "@/lib/adminUsers";
import styles from "@/app/admin/admin.module.css";

/**
 * User directory.
 *
 * Search, filtering, sorting and paging all happen on the server — the console
 * must behave the same with fifty accounts and with fifty thousand, so it never
 * pulls the whole table into the browser to filter it there. Typing is debounced
 * so each keystroke does not become a query.
 */

const PAGE_SIZE = 20;
const SORTS = [
  { key: "createdAt", label: "Сначала новые" },
  { key: "lastLoginAt", label: "Последний визит" },
  { key: "email", label: "Email" },
  { key: "level", label: "Уровень" },
] as const;

const relative = (iso: string | null) => {
  if (!iso) return "никогда";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 30) return new Date(iso).toLocaleDateString();
  if (days >= 1) return `${days} дн. назад`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours} ч назад`;
  return "только что";
};

/**
 * One server answer, tagged with the query object it belongs to. Tagging is what
 * lets render work out whether the rows on screen still match the active query,
 * so "loading" and "error" are read off this object instead of being pushed into
 * React from inside the effect.
 */
type UsersResult = {
  request: UserQuery;
  rows: AdminUserRow[];
  total: number;
  totalPages: number;
  error: string | null;
};

export default function UsersSection() {
  const [filters, setFilters] = useState<UserQuery>({
    query: "",
    comment: "",
    role: "",
    verified: null,
    includeDeleted: false,
    sort: "createdAt",
    direction: "desc",
    page: 0,
    size: PAGE_SIZE,
  });
  const [applied, setApplied] = useState(filters);
  const [result, setResult] = useState<UsersResult | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const params = useSearchParams();

  // A signal can deep-link straight to one account's dossier. The link is the
  // default selection; clicking a row or closing the drawer overrides it, and a
  // link to a different account takes over again.
  const requested = Number(params.get("user"));
  const deepLink = Number.isFinite(requested) && requested > 0 ? requested : null;
  const [override, setOverride] = useState<{ link: number | null; id: number | null }>({
    link: null,
    id: null,
  });
  const openUser = deepLink !== null && deepLink !== override.link ? deepLink : override.id;
  const setOpenUser = (id: number | null) => setOverride({ link: deepLink, id });

  // Debounce the text inputs; the selects apply immediately.
  useEffect(() => {
    const id = window.setTimeout(() => setApplied(filters), 300);
    return () => window.clearTimeout(id);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    fetchUsers(applied)
      .then((page) => {
        if (cancelled) return;
        setResult({
          request: applied,
          rows: page.items,
          total: page.totalItems,
          totalPages: Math.max(1, page.totalPages),
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A failed query keeps the rows already on screen; only the notice changes.
        setResult((cur) => ({
          request: applied,
          rows: cur?.rows ?? [],
          total: cur?.total ?? 0,
          totalPages: cur?.totalPages ?? 1,
          error: err instanceof Error ? err.message : "Не удалось загрузить пользователей.",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [applied]);

  // The answer on screen is stale until it carries the active query.
  const settled = result !== null && result.request === applied;
  const loading = !settled;
  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const error = settled ? result.error : null;

  const patch = (next: Partial<UserQuery>) =>
    setFilters((cur) => ({ ...cur, ...next, page: next.page ?? 0 }));

  const changeRole = async (id: number, role: "USER" | "ADMIN") => {
    setBusyId(id);
    try {
      await setUserRole(id, role);
      setResult((cur) =>
        cur
          ? { ...cur, rows: cur.rows.map((row) => (row.id === id ? { ...row, role } : row)) }
          : cur,
      );
    } catch {
      setResult((cur) => (cur ? { ...cur, error: "Не удалось изменить роль." } : cur));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.usersWrap}>
      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search size={15} />
          <input
            value={filters.query ?? ""}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Имя, email или id…"
            aria-label="Поиск аккаунтов"
          />
          {filters.query ? (
            <button type="button" onClick={() => patch({ query: "" })} aria-label="Очистить поиск">
              <X size={14} />
            </button>
          ) : null}
        </label>

        <label className={styles.searchBox} data-variant="comment">
          <MessageSquare size={15} />
          <input
            value={filters.comment ?? ""}
            onChange={(e) => patch({ comment: e.target.value })}
            placeholder="Писал комментарий, содержащий…"
            aria-label="Поиск по тексту комментария"
          />
          {filters.comment ? (
            <button type="button" onClick={() => patch({ comment: "" })} aria-label="Очистить поиск по комментариям">
              <X size={14} />
            </button>
          ) : null}
        </label>

        <select
          className={styles.select}
          value={filters.role ?? ""}
          onChange={(e) => patch({ role: e.target.value as UserQuery["role"] })}
          aria-label="Фильтр по роли"
        >
          <option value="">Любая роль</option>
          <option value="USER">Пользователи</option>
          <option value="ADMIN">Администраторы</option>
        </select>

        <select
          className={styles.select}
          value={filters.verified === null ? "" : String(filters.verified)}
          onChange={(e) =>
            patch({ verified: e.target.value === "" ? null : e.target.value === "true" })
          }
          aria-label="Фильтр по подтверждению"
        >
          <option value="">Любой статус</option>
          <option value="true">Подтверждённые</option>
          <option value="false">Неподтверждённые</option>
        </select>

        <select
          className={styles.select}
          value={`${filters.sort}:${filters.direction}`}
          onChange={(e) => {
            const [sort, direction] = e.target.value.split(":");
            patch({ sort, direction: direction as "asc" | "desc" });
          }}
          aria-label="Сортировка"
        >
          {SORTS.map((option) => (
            <option key={option.key} value={`${option.key}:desc`}>
              {option.label} ↓
            </option>
          ))}
          {SORTS.map((option) => (
            <option key={`${option.key}-asc`} value={`${option.key}:asc`}>
              {option.label} ↑
            </option>
          ))}
        </select>

        <button
          type="button"
          className={styles.btnGhost}
          data-on={filters.includeDeleted}
          onClick={() => patch({ includeDeleted: !filters.includeDeleted })}
        >
          <SlidersHorizontal size={15} />
          {filters.includeDeleted ? "Включая удалённые" : "Только активные"}
        </button>
      </div>

      {error ? <div className={styles.notice}>{error}</div> : null}

      <section className={styles.card}>
        <div className={styles.listHead}>
          <h3>
            Аккаунтов: {total.toLocaleString("ru-RU")}
            {applied.comment ? ` с «${applied.comment}» в комментариях` : ""}
          </h3>
          {loading ? <Loader2 size={15} className={styles.spin} /> : null}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Статус</th>
                <th>Активность</th>
                <th>Последний визит</th>
                <th>Роль</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={styles.clickableRow}
                  onClick={() => setOpenUser(row.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setOpenUser(row.id);
                  }}
                >
                  <td data-label="Пользователь">
                    <span className={styles.userName}>{row.displayName ?? "—"}</span>
                    <small>
                      {row.email} · #{row.id}
                      {row.signupCountry ? ` · ${row.signupCountry}` : ""}
                    </small>
                  </td>
                  <td data-label="Статус">
                    <div className={styles.tagRow}>
                      {row.emailVerified ? (
                        <span data-tone="ok">
                          <ShieldCheck size={12} /> подтверждён
                        </span>
                      ) : (
                        <span data-tone="warn">не подтверждён</span>
                      )}
                      {row.locked ? <span data-tone="bad">заблокирован</span> : null}
                      {row.deleted ? <span data-tone="bad">удалён</span> : null}
                      {row.adsFree ? <span data-tone="ok">{row.plan ?? "без рекламы"}</span> : null}
                    </div>
                  </td>
                  <td data-label="Активность">
                    <span className={styles.activityCell}>
                      Просмотры: {row.views} · Комментарии: {row.comments}
                    </span>
                  </td>
                  <td data-label="Последний визит">{relative(row.lastLoginAt)}</td>
                  <td data-label="Роль" onClick={(e) => e.stopPropagation()}>
                    <div className={styles.roleCell}>
                      <select
                        className={styles.select}
                        value={row.role}
                        disabled={busyId === row.id}
                        onChange={(e) => changeRole(row.id, e.target.value as "USER" | "ADMIN")}
                        aria-label={`Роль ${row.email}`}
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      {busyId === row.id ? <Loader2 size={14} className={styles.spin} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    По этим фильтрам ничего не найдено.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={styles.pager}>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={(applied.page ?? 0) === 0}
            onClick={() => setFilters((cur) => ({ ...cur, page: (cur.page ?? 0) - 1 }))}
          >
            Назад
          </button>
          <span>
            {(applied.page ?? 0) + 1} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={(applied.page ?? 0) + 1 >= totalPages}
            onClick={() => setFilters((cur) => ({ ...cur, page: (cur.page ?? 0) + 1 }))}
          >
            Далее
          </button>
        </div>
      </section>

      <UserDetailDrawer userId={openUser} onClose={() => setOpenUser(null)} />
    </div>
  );
}
