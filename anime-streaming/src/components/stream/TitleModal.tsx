"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Info,
  Pause,
  Play,
  Plus,
  ThumbsUp,
  VolumeX,
  Volume2,
  X,
} from "lucide-react";
import type { Movie } from "@/data/mockAnime";
import { useMyList } from "@/lib/mylist";
import RemoteImage from "@/components/system/RemoteImage";
import styles from "@/app/stream/stream.module.css";

/**
 * Netflix-style preview modal. Opens on card click: a mini "player" hero,
 * richer metadata and actions, plus a link to the full /anime/[id] page.
 *
 * Phone: a bottom sheet that answers the two gestures a sheet is expected to
 * answer — tap the grab bar or drag it down to dismiss. Tablet and up: a
 * centred dialog. Everywhere: focus is trapped while open, the primary action
 * is focused on open (so Enter on a remote just plays) and focus returns to
 * whatever opened the modal when it closes.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function TitleModal({
  movie,
  onClose,
}: {
  movie: Movie | null;
  onClose: () => void;
}) {
  // Lock scroll + close on Escape while open.
  useEffect(() => {
    if (!movie) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [movie, onClose]);

  if (!movie) return null;

  return <TitleModalBody key={movie.id} movie={movie} onClose={onClose} />;
}

function TitleModalBody({
  movie,
  onClose,
}: {
  movie: Movie;
  onClose: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const { inList, isLiked, toggleList, toggleLike } = useMyList();

  const dialogRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLAnchorElement>(null);

  // Focus management: remember the invoking card, hand focus to the primary
  // action, keep Tab inside the dialog, then give focus back on close.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const opener = document.activeElement as HTMLElement | null;
    playRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const inside = current instanceof Node && node.contains(current);
      if (e.shiftKey && (!inside || current === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || current === last)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
  }, []);

  // ── Sheet drag (phone). A short press with no travel is a tap → close;
  //    dragging past a quarter of the sheet's height also closes.
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ id: number; startY: number; moved: boolean } | null>(null);

  const onHandleDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startY: e.clientY, moved: false };
  }, []);

  const onHandleMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - state.startY);
    if (dy > 4) state.moved = true;
    setDragY(dy);
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const state = drag.current;
      if (!state || state.id !== e.pointerId) return;
      drag.current = null;
      const dy = Math.max(0, e.clientY - state.startY);
      const height = dialogRef.current?.offsetHeight ?? 0;
      if (!state.moved || dy > Math.min(180, height * 0.25)) {
        onClose();
        return;
      }
      setDragY(0);
    },
    [onClose]
  );

  const cancelDrag = useCallback(() => {
    drag.current = null;
    setDragY(0);
  }, []);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={`${styles.modal} ${dragY ? styles.modalDragging : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={movie.title}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={styles.modalHandle}
          type="button"
          aria-label="Close"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
        />

        <button
          className={styles.modalClose}
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        {/* Mini player */}
        <div className={styles.modalHero}>
          <RemoteImage
            src={movie.heroImageUrl}
            alt=""
            fill
            sizes="(max-width: 1200px) 100vw, 1200px"
            className={styles.modalHeroImg}
          />
          <div className={styles.modalHeroScrim} />

          <button
            className={styles.modalBigPlay}
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>

          <div className={styles.modalHeroBottom}>
            <h2 className={styles.modalTitle}>{movie.title}</h2>
            <button
              className={styles.modalMute}
              type="button"
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={() => setMuted((v) => !v)}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          {/* Fake playback progress to imply a live mini-player */}
          <div className={styles.modalProgress} aria-hidden="true">
            <span className={playing ? styles.modalProgressFillOn : styles.modalProgressFill} />
          </div>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          <div className={styles.modalActions}>
            <Link ref={playRef} href={`/anime/${movie.id}`} className={styles.modalPlayBtn}>
              <Play size={18} fill="currentColor" /> Play
            </Link>
            <button
              className={`${styles.modalRound} ${inList(movie.id) ? styles.modalRoundOn : ""}`}
              type="button"
              aria-label={inList(movie.id) ? "Remove from My List" : "Add to My List"}
              aria-pressed={inList(movie.id)}
              onClick={() => toggleList(movie.id)}
            >
              {inList(movie.id) ? <Check size={18} /> : <Plus size={18} />}
            </button>
            <button
              className={`${styles.modalRound} ${isLiked(movie.id) ? styles.modalRoundOn : ""}`}
              type="button"
              aria-label={isLiked(movie.id) ? "Unlike" : "Like"}
              aria-pressed={isLiked(movie.id)}
              onClick={() => toggleLike(movie.id)}
            >
              <ThumbsUp size={17} fill={isLiked(movie.id) ? "currentColor" : "none"} />
            </button>
            <span className={styles.modalSpacer} />
            <Link
              href={`/anime/${movie.id}`}
              className={styles.modalDetailsBtn}
            >
              <Info size={16} /> Full page
            </Link>
          </div>

          <div className={styles.modalMeta}>
            <span className={styles.modalMatch}>{movie.match}% Match</span>
            <span className={styles.modalBadge}>{movie.rating}</span>
            <span>{movie.year}</span>
            <span>{movie.duration}</span>
            <span className={styles.modalBadge}>HD</span>
          </div>

          <p className={styles.modalDesc}>{movie.description}</p>

          <div className={styles.modalTags}>
            <span className={styles.modalTagsLabel}>Genres:</span>
            <span>{movie.genre}</span>
          </div>
          <div className={styles.modalTags}>
            <span className={styles.modalTagsLabel}>Tags:</span>
            <span>{movie.tags.join(" • ")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
