"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  Heart,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  Pencil,
  UserPlus,
  X,
} from "lucide-react";
import {
  getMyComments,
  updateProfile,
  type MyComment,
  type Profile,
} from "@/lib/auth-client";
import styles from "@/app/profile/profile.module.css";
import { deriveAwards } from "./achievements";
import { fmt, monthYear, relativeTime } from "./format";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { useResource } from "./useResource";

export default function OverviewTab({
  profile,
  onProfile,
}: {
  profile: Profile;
  onProfile: (p: Profile) => void;
}) {
  const comments = useResource<MyComment[]>(() => getMyComments(20));
  const awards = deriveAwards(profile);
  const unlocked = awards.filter((a) => a.unlocked).length;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ bio: "", location: "", birthday: "" });

  const stats = [
    { Icon: Eye, label: "Profile views", value: profile.profileViews },
    { Icon: Heart, label: "Likes", value: profile.likes },
    { Icon: UserPlus, label: "Friends", value: profile.friends },
    { Icon: MessageSquare, label: "Posts", value: profile.posts },
    { Icon: MessageCircle, label: "Comments", value: profile.commentsCount },
  ];

  async function saveInfo() {
    setSaving(true);
    setSaveError(null);
    try {
      onProfile(
        await updateProfile({
          bio: draft.bio,
          location: draft.location,
          birthday: draft.birthday || null,
        })
      );
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overview}>
      <div className={styles.statsRow} data-rise>
        {stats.map(({ Icon, label, value }) => (
          <div key={label} className={styles.statCard}>
            <Icon size={18} className={styles.statIcon} />
            <span className={styles.statValue}>{fmt(value)}</span>
            <span className={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      <section className={styles.section} data-rise>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Achievements</h2>
          <span className={styles.sectionMeta}>
            {unlocked} of {awards.length} unlocked
          </span>
        </div>
        <ul className={styles.awardGrid}>
          {awards.map((a) => (
            <li
              key={a.id}
              className={`${styles.award} ${a.unlocked ? styles.awardOn : styles.awardOff}`}
              tabIndex={0}
              title={a.unlocked ? a.description : `Locked — ${a.requirement}`}
              aria-label={
                a.unlocked
                  ? `${a.label}: ${a.description}`
                  : `${a.label}: locked. ${a.requirement}`
              }
            >
              <span
                className={styles.awardCircle}
                style={
                  a.unlocked
                    ? { color: a.color, borderColor: `${a.color}66` }
                    : undefined
                }
              >
                <a.Icon size={22} />
                {a.unlocked ? null : (
                  <span className={styles.awardLock}>
                    <Lock size={11} />
                  </span>
                )}
              </span>
              <span className={styles.awardLabel}>{a.label}</span>
              <span className={styles.awardHint}>
                {a.unlocked ? a.description : a.requirement}
              </span>
              {a.unlocked ? null : (
                <span className={styles.awardTrack} aria-hidden>
                  <span
                    className={styles.awardTrackFill}
                    style={{ width: `${Math.round(a.progress * 100)}%` }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} data-rise>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Personal info</h2>
          {editing ? (
            <div className={styles.sectionActions}>
              <button
                className={styles.primaryBtn}
                type="button"
                onClick={() => void saveInfo()}
                disabled={saving}
              >
                {saving ? <Loader2 size={14} className={styles.spin} /> : null}
                Save
              </button>
              <button
                className={styles.ghostBtn}
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                aria-label="Cancel editing"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <button
              className={styles.ghostBtn}
              type="button"
              onClick={() => {
                setDraft({
                  bio: profile.bio ?? "",
                  location: profile.location ?? "",
                  birthday: profile.birthday ?? "",
                });
                setSaveError(null);
                setEditing(true);
              }}
              aria-label="Edit personal info"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>

        {saveError ? <p className={styles.inlineError}>{saveError}</p> : null}

        {editing ? (
          <div className={styles.infoEdit}>
            <label className={styles.infoField}>
              <span>Bio</span>
              <textarea
                className={styles.infoArea}
                rows={3}
                value={draft.bio}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
              />
            </label>
            <label className={styles.infoField}>
              <span>Location</span>
              <input
                className={styles.infoInput}
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
            </label>
            <label className={styles.infoField}>
              <span>Birthday</span>
              <input
                type="date"
                className={styles.infoInput}
                value={draft.birthday}
                onChange={(e) => setDraft({ ...draft, birthday: e.target.value })}
              />
            </label>
          </div>
        ) : (
          <dl className={styles.infoList}>
            <p className={styles.bio}>
              {profile.bio || "No bio yet — add one with the pencil above."}
            </p>
            <div className={styles.infoRow}>
              <dt>Location</dt>
              <dd>{profile.location || "—"}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt>Birthday</dt>
              <dd>{profile.birthday || "—"}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt>Email</dt>
              <dd>
                {profile.email}
                {profile.emailVerified ? null : (
                  <span className={styles.unverified}>unverified</span>
                )}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>Joined</dt>
              <dd>{monthYear(profile.createdAt)}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className={styles.section} data-rise>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Your recent comments</h2>
          {comments.data?.length ? (
            <span className={styles.sectionMeta}>
              {comments.data.length} shown
            </span>
          ) : null}
        </div>

        {comments.loading ? (
          <Skeleton lines={3} height={44} />
        ) : comments.error ? (
          <ErrorState
            message={`Could not load your comments. ${comments.error}`}
            onRetry={comments.reload}
          />
        ) : comments.data && comments.data.length > 0 ? (
          <ul className={styles.commentList}>
            {comments.data.map((c) => (
              <li key={c.id}>
                <Link href={`/anime/${c.animeId}`} className={styles.commentItem}>
                  <span className={styles.commentHead}>
                    <span className={styles.commentAnime}>{c.animeTitle}</span>
                    <time
                      className={styles.commentTime}
                      dateTime={c.creationDate}
                    >
                      {relativeTime(c.creationDate)}
                    </time>
                  </span>
                  <p className={styles.commentText}>{c.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<MessageCircle size={22} />}
            title="You haven't commented yet"
          >
            <p>
              Open any title and leave a thought — your comments show up here
              with a link back to the anime.
            </p>
            <Link href="/stream" className={styles.primaryLink}>
              Browse the catalog
            </Link>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
