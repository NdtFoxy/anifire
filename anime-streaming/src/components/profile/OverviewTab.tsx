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
    { Icon: Eye, label: "Просмотры профиля", value: profile.profileViews },
    { Icon: Heart, label: "Лайки", value: profile.likes },
    { Icon: UserPlus, label: "Друзья", value: profile.friends },
    { Icon: MessageSquare, label: "Посты", value: profile.posts },
    { Icon: MessageCircle, label: "Комментарии", value: profile.commentsCount },
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
      setSaveError(err instanceof Error ? err.message : "Не удалось сохранить.");
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
          <h2 className={styles.sectionTitle}>Достижения</h2>
          <span className={styles.sectionMeta}>
            {unlocked} из {awards.length} открыто
          </span>
        </div>
        <ul className={styles.awardGrid}>
          {awards.map((a) => (
            <li
              key={a.id}
              className={`${styles.award} ${a.unlocked ? styles.awardOn : styles.awardOff}`}
              tabIndex={0}
              title={a.unlocked ? a.description : `Закрыто — ${a.requirement}`}
              aria-label={
                a.unlocked
                  ? `${a.label}: ${a.description}`
                  : `${a.label}: закрыто. ${a.requirement}`
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
          <h2 className={styles.sectionTitle}>Личная информация</h2>
          {editing ? (
            <div className={styles.sectionActions}>
              <button
                className={styles.primaryBtn}
                type="button"
                onClick={() => void saveInfo()}
                disabled={saving}
              >
                {saving ? <Loader2 size={14} className={styles.spin} /> : null}
                Сохранить
              </button>
              <button
                className={styles.ghostBtn}
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                aria-label="Отменить редактирование"
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
              aria-label="Изменить личную информацию"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>

        {saveError ? <p className={styles.inlineError}>{saveError}</p> : null}

        {editing ? (
          <div className={styles.infoEdit}>
            <label className={styles.infoField}>
              <span>О себе</span>
              <textarea
                className={styles.infoArea}
                rows={3}
                value={draft.bio}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
              />
            </label>
            <label className={styles.infoField}>
              <span>Местоположение</span>
              <input
                className={styles.infoInput}
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              />
            </label>
            <label className={styles.infoField}>
              <span>День рождения</span>
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
              {profile.bio || "Пока ничего о себе — добавьте, нажав на карандаш выше."}
            </p>
            <div className={styles.infoRow}>
              <dt>Местоположение</dt>
              <dd>{profile.location || "—"}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt>День рождения</dt>
              <dd>{profile.birthday || "—"}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt>Эл. почта</dt>
              <dd>
                {profile.email}
                {profile.emailVerified ? null : (
                  <span className={styles.unverified}>не подтверждена</span>
                )}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>На сайте с</dt>
              <dd>{monthYear(profile.createdAt)}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className={styles.section} data-rise>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Ваши последние комментарии</h2>
          {comments.data?.length ? (
            <span className={styles.sectionMeta}>
              показано: {comments.data.length}
            </span>
          ) : null}
        </div>

        {comments.loading ? (
          <Skeleton lines={3} height={44} />
        ) : comments.error ? (
          <ErrorState
            message={`Не удалось загрузить комментарии. ${comments.error}`}
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
            title="Вы ещё не оставляли комментариев"
          >
            <p>
              Откройте любой тайтл и поделитесь мнением — ваши комментарии появятся здесь
              со ссылкой на аниме.
            </p>
            <Link href="/stream" className={styles.primaryLink}>
              Перейти в каталог
            </Link>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
