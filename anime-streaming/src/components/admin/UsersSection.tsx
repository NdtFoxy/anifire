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
  { key: "createdAt", label: "Newest" },
  { key: "lastLoginAt", label: "Last seen" },
  { key: "email", label: "Email" },
  { key: "level", label: "Level" },
] as const;

const relative = (iso: string | null) => {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days > 30) return new Date(iso).toLocaleDateString();
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  return "just now";
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
          error: err instanceof Error ? err.message : "Could not load users.",
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
      setResult((cur) => (cur ? { ...cur, error: "Could not change that role." } : cur));
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
            placeholder="Name, email or id…"
            aria-label="Search accounts"
          />
          {filters.query ? (
            <button type="button" onClick={() => patch({ query: "" })} aria-label="Clear search">
              <X size={14} />
            </button>
          ) : null}
        </label>

        <label className={styles.searchBox} data-variant="comment">
          <MessageSquare size={15} />
          <input
            value={filters.comment ?? ""}
            onChange={(e) => patch({ comment: e.target.value })}
            placeholder="Wrote a comment containing…"
            aria-label="Search by comment text"
          />
          {filters.comment ? (
            <button type="button" onClick={() => patch({ comment: "" })} aria-label="Clear comment search">
              <X size={14} />
            </button>
          ) : null}
        </label>

        <select
          className={styles.select}
          value={filters.role ?? ""}
          onChange={(e) => patch({ role: e.target.value as UserQuery["role"] })}
          aria-label="Filter by role"
        >
          <option value="">Any role</option>
          <option value="USER">Users</option>
          <option value="ADMIN">Admins</option>
        </select>

        <select
          className={styles.select}
          value={filters.verified === null ? "" : String(filters.verified)}
          onChange={(e) =>
            patch({ verified: e.target.value === "" ? null : e.target.value === "true" })
          }
          aria-label="Filter by verification"
        >
          <option value="">Any status</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>

        <select
          className={styles.select}
          value={`${filters.sort}:${filters.direction}`}
          onChange={(e) => {
            const [sort, direction] = e.target.value.split(":");
            patch({ sort, direction: direction as "asc" | "desc" });
          }}
          aria-label="Sort"
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
          {filters.includeDeleted ? "Including deleted" : "Active only"}
        </button>
      </div>

      {error ? <div className={styles.notice}>{error}</div> : null}

      <section className={styles.card}>
        <div className={styles.listHead}>
          <h3>
            {total.toLocaleString("en-US")} account{total === 1 ? "" : "s"}
            {applied.comment ? ` matching “${applied.comment}” in comments` : ""}
          </h3>
          {loading ? <Loader2 size={15} className={styles.spin} /> : null}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Activity</th>
                <th>Last seen</th>
                <th>Role</th>
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
                  <td data-label="User">
                    <span className={styles.userName}>{row.displayName ?? "—"}</span>
                    <small>
                      {row.email} · #{row.id}
                      {row.signupCountry ? ` · ${row.signupCountry}` : ""}
                    </small>
                  </td>
                  <td data-label="Status">
                    <div className={styles.tagRow}>
                      {row.emailVerified ? (
                        <span data-tone="ok">
                          <ShieldCheck size={12} /> verified
                        </span>
                      ) : (
                        <span data-tone="warn">unverified</span>
                      )}
                      {row.locked ? <span data-tone="bad">locked</span> : null}
                      {row.deleted ? <span data-tone="bad">deleted</span> : null}
                      {row.adsFree ? <span data-tone="ok">{row.plan ?? "ads-free"}</span> : null}
                    </div>
                  </td>
                  <td data-label="Activity">
                    <span className={styles.activityCell}>
                      {row.views} views · {row.comments} comments
                    </span>
                  </td>
                  <td data-label="Last seen">{relative(row.lastLoginAt)}</td>
                  <td data-label="Role" onClick={(e) => e.stopPropagation()}>
                    <div className={styles.roleCell}>
                      <select
                        className={styles.select}
                        value={row.role}
                        disabled={busyId === row.id}
                        onChange={(e) => changeRole(row.id, e.target.value as "USER" | "ADMIN")}
                        aria-label={`Role of ${row.email}`}
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
                    Nothing matches these filters.
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
            Previous
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
            Next
          </button>
        </div>
      </section>

      <UserDetailDrawer userId={openUser} onClose={() => setOpenUser(null)} />
    </div>
  );
}
