"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { fetchFriendFeed, type FriendActivity } from "@/lib/library";
import { mediaUrl } from "@/lib/auth-client";
import RemoteImage from "@/components/system/RemoteImage";
import { relativeTime } from "./format";
import styles from "@/app/profile/profile.module.css";

/** "Что смотрят друзья": each friend's latest episode per title, newest first. */
export default function FriendsFeed() {
  const [items, setItems] = useState<FriendActivity[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Promise chain so the mount effect writes no state synchronously.
  const load = useCallback(
    () =>
      fetchFriendFeed()
        .then((next) => {
          setItems(next);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <section className={styles.friendSection}>
        <h3>Что смотрят друзья</h3>
        <p className={styles.friendNotice}>
          Не удалось загрузить ленту.{" "}
          <button type="button" className={styles.friendGhost} onClick={() => void load()}>
            Повторить
          </button>
        </p>
      </section>
    );
  }
  if (!items || items.length === 0) return null;

  return (
    <section className={styles.friendSection}>
      <h3>Что смотрят друзья</h3>
      <ul className={styles.friendList}>
        {items.map((a) => (
          <li key={`${a.userId}-${a.animeKey}`} className={styles.friendRow}>
            <RemoteImage
              src={mediaUrl(a.avatarUrl) ?? "/hero-2.png"}
              alt=""
              width={42}
              height={42}
              className={styles.friendAvatar}
            />
            <div className={styles.friendBody}>
              <span className={styles.friendName}>{a.animeTitle ?? a.animeKey}</span>
              <span className={styles.friendMeta}>
                {a.displayName ?? "Друг"} · серия {a.episode} · {relativeTime(a.watchedAt)}
              </span>
            </div>
            <div className={styles.friendActions}>
              <Link
                href={`/watch/${encodeURIComponent(a.animeKey)}?ep=${a.episode}`}
                className={styles.friendAccept}
                aria-label={`Смотреть ${a.animeTitle ?? ""}, серия ${a.episode}`}
              >
                <Play size={16} />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
