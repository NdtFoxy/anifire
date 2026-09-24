"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import {
  fetchEpisodeEmails,
  fetchInbox,
  fetchUnreadCount,
  markAllRead,
  setEpisodeEmails,
  type Inbox,
} from "@/lib/notifications";
import navStyles from "@/app/stream/stream.module.css";
import styles from "./NotificationBell.module.css";

/** How often the badge re-checks while the tab is visible. */
const POLL_MS = 60_000;

const RELATIVE = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });

function ago(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (minutes > -60) return RELATIVE.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return RELATIVE.format(hours, "hour");
  return RELATIVE.format(Math.round(hours / 24), "day");
}

/**
 * New-episode inbox for signed-in viewers. The badge polls a count-only
 * endpoint; the list loads when the panel opens, and opening it marks
 * everything read. `?notifications=open` (the link in the email digest) opens it.
 */
export default function NotificationBell() {
  const params = useSearchParams();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(params?.get("notifications") === "open");
  const openedFromLink = useRef(open);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [emails, setEmails] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fetch first, then set state, so this is safe to start from effects and handlers.
  const load = useCallback(async () => {
    try {
      const [box, pref] = await Promise.all([fetchInbox(), fetchEpisodeEmails()]);
      setFailed(false);
      setInbox(box);
      setEmails(pref);
      if (box.unread > 0) {
        await markAllRead();
        setUnread(0);
      }
    } catch {
      setFailed(true);
    }
  }, []);

  // Badge: poll only while the tab is visible, so background tabs cost nothing.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fetchUnreadCount()
        .then((n) => !cancelled && setUnread(n))
        .catch(() => {});
    };
    tick();
    // Arrived from the email digest link: the panel starts open, so fill it
    // (deferred a tick — state is set only once the data is back).
    if (openedFromLink.current) {
      void Promise.resolve().then(() => {
        if (!cancelled) void load();
      });
    }
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleEmails = async () => {
    if (emails === null) return;
    const next = !emails;
    setEmails(next);
    try {
      setEmails(await setEpisodeEmails(next));
    } catch {
      setEmails(!next);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${navStyles.iconBtn} ${styles.bell}`}
        aria-label={unread > 0 ? `Уведомления: ${unread} новых` : "Уведомления"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) void load();
          setOpen(!open);
        }}
      >
        <Bell size={18} />
        {unread > 0 ? <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Уведомления">
          <div className={styles.head}>Новые серии</div>
          {failed ? (
            <p className={styles.empty}>
              Не удалось загрузить уведомления.{" "}
              <button type="button" className={styles.linkBtn} onClick={load}>
                Повторить
              </button>
            </p>
          ) : !inbox ? (
            <p className={styles.empty}>Загрузка…</p>
          ) : inbox.items.length === 0 ? (
            <p className={styles.empty}>
              Пока тихо. Добавьте тайтл в закладки — и мы сообщим о новой серии.
            </p>
          ) : (
            <ul className={styles.list}>
              {inbox.items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/watch/${n.animeId}?ep=${n.episode}`}
                    className={`${styles.item} ${n.read ? "" : styles.unread}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className={styles.title}>{n.animeTitle}</span>
                    <span className={styles.meta}>
                      Серия {n.episode} · {ago(n.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <label className={styles.pref}>
            <input
              type="checkbox"
              checked={emails ?? false}
              disabled={emails === null}
              onChange={toggleEmails}
            />
            Присылать письма о новых сериях
          </label>
        </div>
      ) : null}
    </div>
  );
}
