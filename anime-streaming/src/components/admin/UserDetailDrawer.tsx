"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bookmark,
  Clock,
  Globe2,
  KeyRound,
  Loader2,
  MessageCircle,
  Monitor,
  ShieldAlert,
  Star,
  Users2,
  X,
} from "lucide-react";
import { fetchUserDetail, type AdminUserDetail } from "@/lib/adminUsers";
import { mediaUrl } from "@/lib/auth-client";
import RemoteImage from "@/components/system/RemoteImage";
import styles from "@/app/admin/admin.module.css";

/**
 * Everything known about one account, in a slide-over.
 *
 * A drawer rather than a route because the operator is working through a list:
 * closing it must put them back exactly where they were, mid-scroll and
 * mid-filter. Escape closes, and focus returns to the row that opened it.
 */

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString() : "—";

function duration(seconds: number): string {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * One dossier answer, tagged with the account it describes. The tag is how render
 * knows the drawer is showing a fresh account and should be back on its loading
 * state, without the effect having to blank the previous one out.
 */
type DetailResult = {
  userId: number;
  data: AdminUserDetail | null;
  error: string | null;
};

export default function UserDetailDrawer({
  userId,
  onClose,
}: {
  userId: number | null;
  onClose: () => void;
}) {
  const [result, setResult] = useState<DetailResult | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    fetchUserDetail(userId)
      .then((detail) => {
        if (!cancelled) setResult({ userId, data: detail, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            userId,
            data: null,
            error: err instanceof Error ? err.message : "Failed to load.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Anything answered for another account counts as "still loading".
  const current = result !== null && result.userId === userId ? result : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    if (userId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId, onClose]);

  if (userId === null) return null;

  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Account details"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.drawerHead}>
          {data ? (
            <>
              <RemoteImage
                src={mediaUrl(data.profile.avatarUrl) ?? "/hero-2.png"}
                alt=""
                width={46}
                height={46}
                className={styles.drawerAvatar}
              />
              <div>
                <h3>{data.profile.displayName ?? "Unnamed account"}</h3>
                <p>
                  {data.profile.email} · #{data.profile.id}
                </p>
              </div>
              <span className={styles.rolePill} data-admin={data.profile.role === "ADMIN"}>
                {data.profile.role}
              </span>
            </>
          ) : (
            <h3>Loading…</h3>
          )}
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {error ? <div className={styles.notice}>{error}</div> : null}

        {!data && !error ? (
          <p className={styles.geoHint}>
            <Loader2 size={14} className={styles.spin} /> Loading the dossier…
          </p>
        ) : null}

        {data ? (
          <div className={styles.drawerBody}>
            <div className={styles.miniGrid}>
              <span>
                <Clock size={14} /> Watched
                <b>{duration(data.engagement.watchedSeconds)}</b>
              </span>
              <span>
                <Activity size={14} /> Views
                <b>{data.engagement.views}</b>
              </span>
              <span>
                <MessageCircle size={14} /> Comments
                <b>{data.engagement.comments}</b>
              </span>
              <span>
                <Star size={14} /> Ratings
                <b>
                  {data.engagement.ratings}
                  {data.engagement.averageScore
                    ? ` · avg ${data.engagement.averageScore.toFixed(1)}`
                    : ""}
                </b>
              </span>
              <span>
                <Bookmark size={14} /> Bookmarks
                <b>{data.engagement.bookmarks}</b>
              </span>
              <span>
                <Users2 size={14} /> Friends
                <b>{data.engagement.friends}</b>
              </span>
            </div>

            <section>
              <h4>Timeline</h4>
              <dl className={styles.defList}>
                <div>
                  <dt>Account created</dt>
                  <dd>{fmt(data.timeline.createdAt)}</dd>
                </div>
                <div>
                  <dt>Password set</dt>
                  <dd>
                    {fmt(data.timeline.passwordChangedAt)}
                    {data.security.passwordNeverChanged ? " · never changed" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Last sign-in</dt>
                  <dd>{fmt(data.timeline.lastLoginAt)}</dd>
                </div>
                <div>
                  <dt>First episode</dt>
                  <dd>{fmt(data.timeline.firstWatchAt)}</dd>
                </div>
                <div>
                  <dt>Last activity</dt>
                  <dd>{fmt(data.timeline.lastActivityAt)}</dd>
                </div>
                <div>
                  <dt>
                    <Globe2 size={13} /> Signed up from
                  </dt>
                  <dd>{data.profile.signupCountry ?? "unknown"}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h4>
                <ShieldAlert size={14} /> Security
              </h4>
              <div className={styles.tagRow}>
                <span data-tone={data.security.emailVerified ? "ok" : "warn"}>
                  {data.security.emailVerified ? "email verified" : "email unverified"}
                </span>
                <span data-tone={data.security.locked ? "bad" : "ok"}>
                  {data.security.locked ? `locked until ${fmt(data.security.lockedUntil)}` : "not locked"}
                </span>
                <span>{data.security.failedAttempts} failed attempts</span>
                <span>
                  <Monitor size={12} /> {data.security.activeSessions} active sessions
                </span>
                {data.engagement.adsFree ? (
                  <span data-tone="ok">{data.engagement.plan ?? "ads-free"}</span>
                ) : (
                  <span>free plan</span>
                )}
              </div>
              {data.linkedAccounts.length > 0 ? (
                <ul className={styles.plainList}>
                  {data.linkedAccounts.map((account) => (
                    <li key={account.provider}>
                      <KeyRound size={13} /> {account.provider} linked {fmt(account.linkedAt)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {data.sessions.length > 0 ? (
                <ul className={styles.plainList}>
                  {data.sessions.map((session, i) => (
                    <li key={i}>
                      <Monitor size={13} />
                      <span title={session.userAgent ?? ""}>
                        {(session.userAgent ?? "unknown device").slice(0, 48)}
                      </span>
                      <em>{session.ipAddress ?? "—"}</em>
                      <time>{fmt(session.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section>
              <h4>
                <Star size={14} /> Ratings given
              </h4>
              {data.ratings.length === 0 ? (
                <p className={styles.geoHint}>This account has not scored anything yet.</p>
              ) : (
                <ul className={styles.ratingList}>
                  {data.ratings.map((rating) => (
                    <li key={rating.animeId}>
                      <RemoteImage
                        src={rating.imageUrl ?? "/hero-2.png"}
                        alt=""
                        width={40}
                        height={56}
                      />
                      <div>
                        <b>{rating.title}</b>
                        {rating.review ? <small>{rating.review}</small> : null}
                        <time>{fmt(rating.at)}</time>
                      </div>
                      <span className={styles.scoreBadge} data-high={rating.score >= 8}>
                        {rating.score}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4>
                <MessageCircle size={14} /> Recent comments
              </h4>
              {data.recentComments.length === 0 ? (
                <p className={styles.geoHint}>No comments.</p>
              ) : (
                <ul className={styles.plainList}>
                  {data.recentComments.map((comment) => (
                    <li key={comment.id}>
                      <b>{comment.animeTitle ?? "—"}</b>
                      <span>{comment.text}</span>
                      <time>{fmt(comment.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4>
                <Activity size={14} /> Recently watched
              </h4>
              {data.recentWatches.length === 0 ? (
                <p className={styles.geoHint}>Nothing watched yet.</p>
              ) : (
                <ul className={styles.plainList}>
                  {data.recentWatches.map((watch, i) => (
                    <li key={`${watch.animeKey}-${i}`}>
                      <b>{watch.animeTitle ?? watch.animeKey}</b>
                      <span>episode {watch.episode}</span>
                      <time>{fmt(watch.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
