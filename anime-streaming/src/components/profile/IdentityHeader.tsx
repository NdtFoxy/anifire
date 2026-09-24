"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Dices,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  mediaUrl,
  randomizeProfile,
  removeProfileImage,
  updateProfile,
  uploadProfileImage,
  type Profile,
} from "@/lib/auth-client";
import RemoteImage from "@/components/system/RemoteImage";
import styles from "@/app/profile/profile.module.css";
import { fmt } from "./format";
import { levelProgress, levelTitle } from "./progression";

const FALLBACK_AVATAR = "/hero-2.png";
const FALLBACK_BANNER = "/hero-1.png";
const MAX_BYTES = 5 * 1024 * 1024;

type ImageKind = "avatar" | "banner";

export default function IdentityHeader({
  profile,
  onProfile,
}: {
  profile: Profile;
  onProfile: (p: Profile) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [randomizing, setRandomizing] = useState(false);
  const [busy, setBusy] = useState<ImageKind | null>(null);
  const [preview, setPreview] = useState<Partial<Record<ImageKind, string>>>({});
  const [imageError, setImageError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  // Object URLs are only alive for the duration of an in-flight upload.
  useEffect(
    () => () => {
      for (const url of Object.values(preview)) URL.revokeObjectURL(url);
    },
    [preview]
  );

  const name =
    profile.displayName || profile.email.split("@")[0] || "Anifire user";
  const avatar = preview.avatar ?? mediaUrl(profile.avatarUrl) ?? FALLBACK_AVATAR;
  const banner = preview.banner ?? mediaUrl(profile.bannerUrl) ?? FALLBACK_BANNER;
  const progress = levelProgress(profile.points, profile.level);

  async function upload(kind: ImageKind, file: File) {
    setImageError(null);
    if (!file.type.startsWith("image/")) {
      setImageError("That file is not an image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setImageError("Images must be 5 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview((p) => ({ ...p, [kind]: url }));
    setBusy(kind);
    try {
      onProfile(await uploadProfileImage(kind, file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      URL.revokeObjectURL(url);
      setPreview((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
      setBusy(null);
    }
  }

  async function remove(kind: ImageKind) {
    setImageError(null);
    setBusy(kind);
    try {
      onProfile(await removeProfileImage(kind));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Could not remove image.");
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    const value = nameDraft.trim();
    if (!value || value === profile.displayName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      onProfile(await updateProfile({ displayName: value }));
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Could not save name.");
    } finally {
      setSavingName(false);
    }
  }

  async function randomize() {
    setRandomizing(true);
    setImageError(null);
    try {
      onProfile(await randomizeProfile());
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Randomize failed.");
    } finally {
      setRandomizing(false);
    }
  }

  return (
    <>
      <div className={styles.banner}>
        <RemoteImage
          src={banner}
          alt=""
          fill
          sizes="100vw"
          loading="eager"
          className={styles.bannerImg}
        />
        <div className={styles.bannerScrim} />
        <span className={styles.idBadge}>ID {profile.id}</span>

        <div className={styles.bannerTools}>
          <button
            className={styles.bannerBtn}
            type="button"
            onClick={() => bannerInput.current?.click()}
            disabled={busy !== null}
          >
            {busy === "banner" ? (
              <Loader2 size={15} className={styles.spin} />
            ) : (
              <Camera size={15} />
            )}
            {busy === "banner" ? "Uploading…" : "Change banner"}
          </button>
          {profile.bannerUrl ? (
            <button
              className={styles.bannerBtn}
              type="button"
              onClick={() => remove("banner")}
              disabled={busy !== null}
              aria-label="Remove banner"
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
        <input
          ref={bannerInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload("banner", file);
          }}
        />
      </div>

      <header className={styles.identity}>
        <div className={styles.avatarWrap}>
          <span className={styles.avatarRing} aria-hidden />
          <RemoteImage
            src={avatar}
            alt={name}
            width={148}
            height={148}
            loading="eager"
            className={styles.avatar}
          />
          {busy === "avatar" ? (
            <span className={styles.avatarBusy} aria-live="polite">
              <Loader2 size={22} className={styles.spin} />
            </span>
          ) : null}
          <button
            className={styles.avatarEdit}
            type="button"
            onClick={() => avatarInput.current?.click()}
            disabled={busy !== null}
            aria-label="Change avatar"
          >
            <Camera size={16} />
          </button>
          {profile.avatarUrl ? (
            <button
              className={`${styles.avatarEdit} ${styles.avatarRemove}`}
              type="button"
              onClick={() => remove("avatar")}
              disabled={busy !== null}
              aria-label="Remove avatar"
            >
              <X size={16} />
            </button>
          ) : null}
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload("avatar", file);
            }}
          />
        </div>

        <div className={styles.identityBody}>
          <div className={styles.nameRow}>
            {editingName ? (
              <div className={styles.nameEdit}>
                <input
                  className={styles.nameInput}
                  value={nameDraft}
                  maxLength={60}
                  onChange={(e) => setNameDraft(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <button
                  className={styles.miniBtn}
                  type="button"
                  onClick={() => void saveName()}
                  disabled={savingName}
                  aria-label="Save nickname"
                >
                  {savingName ? (
                    <Loader2 size={15} className={styles.spin} />
                  ) : (
                    <Check size={15} />
                  )}
                </button>
                <button
                  className={styles.miniBtn}
                  type="button"
                  onClick={() => setEditingName(false)}
                  disabled={savingName}
                  aria-label="Cancel"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <>
                <h1 className={styles.name}>{name}</h1>
                {profile.emailVerified ? (
                  <ShieldCheck
                    size={17}
                    className={styles.verified}
                    aria-label="Email verified"
                  />
                ) : null}
                <button
                  className={styles.editNameBtn}
                  type="button"
                  onClick={() => {
                    setNameDraft(profile.displayName ?? name);
                    setNameError(null);
                    setEditingName(true);
                  }}
                  aria-label="Edit nickname"
                >
                  <Pencil size={14} />
                </button>
              </>
            )}

            <button
              className={styles.randomBtn}
              type="button"
              onClick={() => void randomize()}
              disabled={randomizing}
              title="Fill the profile with random data (saved to the database)"
            >
              {randomizing ? (
                <Loader2 size={15} className={styles.spin} />
              ) : (
                <Dices size={15} />
              )}
              Randomize
            </button>
          </div>

          {nameError ? <p className={styles.inlineError}>{nameError}</p> : null}
          {imageError ? <p className={styles.inlineError}>{imageError}</p> : null}

          <div className={styles.levelRow}>
            <span className={styles.levelLabel}>
              Lvl {progress.level} · {levelTitle(progress.level)}
            </span>
            <div
              className={styles.levelBar}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.span}
              aria-valuenow={progress.into}
              aria-label={`Progress to level ${progress.nextLevel}`}
            >
              <div
                className={styles.levelFill}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className={styles.levelPts}>
              {fmt(progress.into)} / {fmt(progress.span)} pts ·{" "}
              {fmt(progress.remaining)} to Lvl {progress.nextLevel}
            </span>
          </div>
        </div>
      </header>
    </>
  );
}
