"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Captions,
  Droplet,
  FastForward,
  ListVideo,
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Sun,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useDevice } from "@/components/system/DeviceProvider";
import RemoteImage from "@/components/system/RemoteImage";
import { upscaleFilter } from "@/lib/upscale";
import { formatTime } from "./format";
import { usePlayerSettings } from "./usePlayerSettings";
import { usePlayer } from "./PlayerProvider";
import SubtitleOverlay from "./SubtitleOverlay";
import SettingsMenu from "./SettingsMenu";
import SeekBar from "./SeekBar";
import AdOverlay from "./AdOverlay";
import { useAdPlan } from "./useAdPlan";
import { useWatchProgress } from "./useWatchProgress";
import { useStudy } from "./useStudy";
import { useStudyWord } from "./useStudyWord";
import { useSubtitleTranslation } from "./useSubtitleTranslation";
import { useMediaState } from "./useMediaState";
import { useMediaSource } from "./useMediaSource";
import { useMiniWindow } from "./useMiniWindow";
import { useHud } from "./useHud";
import { useVolume } from "./useVolume";
import { useOsd } from "./useOsd";
import { useFullscreen } from "./useFullscreen";
import { usePlayerKeyboard } from "./usePlayerKeyboard";
import { useTvOsdFocus } from "./useTvOsdFocus";
import { useChapterSkip } from "./useChapterSkip";
import { useTouchGestures } from "./useTouchGestures";
import WordCard from "./WordCard";
import IconBtn from "./IconBtn";
import ProgressBar from "./ProgressBar";
import { useAuth } from "@/components/auth/AuthProvider";
import styles from "./player.module.css";

/**
 * The single, app-wide player. Mounted once in the root layout so playback (one
 * <video> element) survives route changes AND full↔mini switches — the video
 * lives at a stable position in the tree and is never remounted, so it never
 * reloads or loses its position. Renders the full overlay on /watch and a
 * draggable, resizable, dimmable floating window everywhere else.
 */
export default function PlayerRoot() {
  const router = useRouter();
  const { source, mode, mini, mergeTracks, minimize, maximize, close, setMini } =
    usePlayer();
  const { device, input, tv } = useDevice();
  /** D-pad driven surface: a real TV, or anyone currently pressing arrows on one. */
  const isRemote = tv || input === "remote";
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);

  const tracks = useMemo(() => source?.tracks ?? [], [source]);
  const { settings, update, updatePrimaryStyle, updateSecondaryStyle, reset } =
    usePlayerSettings(tracks);

  const { translatingLang, canTranslate, requestLanguage } = useSubtitleTranslation({
    source,
    selection: settings.selection,
    mergeTracks,
    update,
  });

  const { playing, time, duration, buffered, seekTo, seekBy } = useMediaState({
    videoRef,
    sourceKey: source?.key,
    playbackRate: settings.playbackRate,
  });

  const { user } = useAuth();
  /**
   * Resume slot for this source. `source.key` is `${animeId}-${episode}`, so its
   * first segment is the catalogue key the rest of the app already uses; falling
   * back to the whole key keeps slug-based sources working too.
   */
  const progressSlot = useMemo(() => {
    if (!source) return null;
    const animeKey = source.key.includes("-") ? source.key.split("-")[0] : source.key;
    return {
      animeKey,
      animeTitle: source.title,
      episode: source.episode ?? 1,
      provider: source.provider ?? null,
    };
  }, [source]);

  /**
   * Requested start point.
   *
   * The source carries it when the watch page opened a deep link, but the player
   * also reads `?t=` directly: `open()` dedupes by source key, so arriving at an
   * already-open episode with a new timestamp would otherwise keep the old source
   * object — and the viewer would land on their saved position instead of the
   * scene they clicked.
   */
  const requestedStart = useMemo(() => {
    if (source?.startAt !== undefined) return source.startAt;
    if (typeof window === "undefined") return undefined;
    const raw = Number(new URLSearchParams(window.location.search).get("t"));
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }, [source]);

  /**
   * Vocabulary layer. Keyed off the *primary* subtitle track, because that is the
   * language the viewer is reading; it stays inert unless they marked that
   * language as one they are learning.
   */
  const primaryTrack = useMemo(() => {
    const id = settings.selection.primary;
    return id ? source?.tracks.find((track) => track.id === id) ?? null : null;
  }, [settings.selection.primary, source]);

  const study = useStudy({
    track: primaryTrack,
    animeKey: progressSlot?.animeKey ?? null,
    episode: progressSlot?.episode ?? null,
    enabled: !!user && mode === "full",
  });

  const { studyWord, openWord, markWord, closeWord } = useStudyWord({
    videoRef,
    source,
    secondaryTrackId: settings.selection.secondary,
    time,
    study,
  });

  useWatchProgress({
    videoRef,
    slot: progressSlot,
    playing,
    // An explicit "?t=" beats the saved position: the viewer picked the moment.
    skipResume: requestedStart !== undefined,
    // Guests have nowhere to store a position; the local mirror is still written
    // by the hook only when a slot exists, so nothing leaks between accounts.
    enabled: !!user && !!progressSlot,
  });
  const [subsOn, setSubsOn] = useState(true);
  const toggleSubs = useCallback(() => setSubsOn((s) => !s), []);
  const [opacityOpen, setOpacityOpen] = useState(false);

  const {
    viewport,
    layout: resolvedMini,
    height: miniHeight,
    startDrag,
    startResize,
  } = useMiniWindow({ mini, setMini });

  // Declared after useWatchProgress on purpose: effect cleanups run in
  // declaration order, and its teardown save must read the position before this
  // hook's teardown `load()` resets the element to zero.
  const { qualityOptions } = useMediaSource({
    videoRef,
    source,
    quality: settings.quality,
    requestedStart,
  });

  /* ─────────── pre-roll advertising ───────────
   *
   * The server decides whether there is an ad; this side only obeys it. The roll
   * owns the frame, the episode <video> stays mounted (dropping it would destroy
   * the hls.js instance and restart the whole load) but paused and silent behind
   * it, and when the roll is over the episode plays from wherever its own resume
   * logic already put the head — the deep link, the saved position, or zero. */
  const resumeAfterAd = useCallback(() => {
    // Deliberately no seek: restorePlayback and useWatchProgress ran during the
    // roll and have already placed the head. Re-deciding it here would be a
    // second, competing resume path.
    videoRef.current?.play().catch(() => {});
  }, []);
  const ad = useAdPlan(source, resumeAfterAd);
  const adRunning = ad.state === "playing";

  /* An ad and an episode must never be audible together, and the episode must
     not advance behind the roll. */
  useEffect(() => {
    if (!adRunning) return;
    videoRef.current?.pause();
  }, [adRunning]);

  const { hud, flashHud } = useHud();
  const { volume, muted, changeVolume, bumpVolume, toggleMute } = useVolume({
    videoRef,
    adRunning,
    flashHud,
  });

  /* ─────────── transport ─────────── */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // A pre-roll is owed a play before the episode gets one, and this press is
      // the user gesture that lets it play with sound at all.
      if (ad.begin()) return;
      v.play().catch(() => {});
    } else v.pause();
  }, [ad]);

  const {
    controls,
    setControls,
    scrubbing,
    settingsOpen,
    setSettingsOpen,
    showControls,
    dismissControls,
    nudge,
  } = useOsd({ tv, seekBy });

  const { fullscreen, toggleFullscreen } = useFullscreen({ shellRef, device });

  const goMini = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setSettingsOpen(false);
    minimize();
    if (source) router.push(source.backHref);
  }, [minimize, router, source, setSettingsOpen]);

  const goFull = useCallback(() => {
    maximize();
    if (source) router.push(source.selfHref);
  }, [maximize, router, source]);

  const doClose = useCallback(() => {
    const v = videoRef.current;
    if (v) v.pause();
    close();
  }, [close]);

  useEffect(() => {
    if (mode !== "full") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.scrollTo({ top: 0, left: 0 });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mode]);

  usePlayerKeyboard({
    enabled: mode === "full" && !adRunning,
    isRemote,
    controls,
    setControls,
    settingsOpen,
    setSettingsOpen,
    volume,
    togglePlay,
    showControls,
    nudge,
    changeVolume,
    bumpVolume,
    toggleMute,
    toggleSubs,
    toggleFullscreen,
    goMini,
  });

  useTvOsdFocus({ enabled: tv && mode === "full" && !adRunning, controls, playBtnRef });

  const skipTarget = useChapterSkip({
    source,
    time,
    autoSkipIntro: settings.autoSkipIntro,
    offerButton: mode !== "mini",
    seekTo,
  });

  const {
    ripple,
    brightness,
    onShellPointerDown,
    onShellPointerMove,
    onShellPointerUp,
    onShellPointerCancel,
    onShellClick,
    onShellMouseMove,
  } = useTouchGestures({
    muted,
    volume,
    changeVolume,
    flashHud,
    togglePlay,
    seekBy,
    controls,
    showControls,
    dismissControls,
    settingsOpen,
    setSettingsOpen,
  });

  if (!source || mode === "closed") return null;

  const isMini = mode === "mini";
  const upFilter = upscaleFilter(settings.upscale);
  /** The upscale filter and the brightness gesture share one filter chain. */
  const filterChain = [
    upFilter === "none" ? null : upFilter,
    brightness === 1 ? null : `brightness(${brightness.toFixed(2)})`,
  ]
    .filter(Boolean)
    .join(" ");
  const videoStyle = filterChain ? { filter: filterChain } : undefined;
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  /* Subtitles. `fontSize` is authored against a 1080p frame, so a 390px-tall
     landscape phone would render it at ~11px; the floor lifts it to --step-0
     territory, and TV both floors and ceilings much higher. The lift keeps the
     text above the control bar (--osd-h, declared per device in CSS) and out of
     the home indicator. */
  const subMinPx = tv ? 26 : device === "phone" ? 15 : 13;
  const subMaxPx = isMini ? 20 : tv ? 76 : 64;
  const subLift = isMini
    ? "12px"
    : controls
      ? "calc(var(--safe-bottom) + var(--osd-h))"
      : "calc(var(--safe-bottom) + 24px)";

  return (
    <div
      ref={shellRef}
      className={isMini ? styles.mini : `${styles.shell} ${controls ? styles.shellActive : ""}`}
      style={
        isMini
          ? {
              left: resolvedMini.x,
              top: resolvedMini.y,
              width: resolvedMini.width,
              height: miniHeight,
              opacity: resolvedMini.opacity,
            }
          : undefined
      }
      /* Hides every sibling the roll must cover — the CSS keys off it, so the
         chrome behind an ad is not merely covered but unfocusable. */
      data-ad={adRunning ? "playing" : undefined}
      onPointerDown={isMini ? undefined : onShellPointerDown}
      onPointerMove={isMini ? undefined : onShellPointerMove}
      onPointerUp={isMini ? undefined : onShellPointerUp}
      onPointerCancel={isMini ? undefined : onShellPointerCancel}
      onMouseMove={isMini ? undefined : onShellMouseMove}
      onMouseLeave={isMini ? undefined : () => !settingsOpen && setControls(false)}
      onClick={isMini ? undefined : onShellClick}
    >
      {/* The one persistent video element — stable across full ↔ mini. */}
      <video
        ref={videoRef}
        className={styles.video}
        poster={source.poster}
        playsInline
        style={videoStyle}
        onClick={isMini ? togglePlay : undefined}
      />

      {/* When paused, cover the frozen frame with the poster art — looks cleaner
          than a paused mid-scene. Clicks pass through to toggle play. Unoptimized
          on purpose: it reuses the URL <video poster> already fetched, so the
          cover is instant from cache rather than a black box awaiting a second,
          optimized copy. */}
      {!playing && source.poster ? (
        <RemoteImage
          src={source.poster}
          alt=""
          aria-hidden="true"
          fill
          sizes="100vw"
          unoptimized
          loading="eager"
          className={styles.pausePoster}
        />
      ) : null}

      {subsOn && (
        <SubtitleOverlay
          tracks={source.tracks}
          settings={settings}
          time={time}
          lift={subLift}
          basisPx={isMini ? miniHeight : viewport.h || 800}
          minPx={subMinPx}
          maxPx={subMaxPx}
          study={study}
          onWord={openWord}
        />
      )}

      {studyWord ? (
        <WordCard
          token={studyWord.token}
          line={studyWord.line}
          translation={studyWord.translation}
          onMark={markWord}
          onClose={closeWord}
        />
      ) : null}

      {/* ════════ MINI CHROME ════════ */}
      {isMini ? (
        <>
          <div className={styles.miniDrag} onPointerDown={startDrag}>
            <span className={styles.miniTitle}>{source.title}</span>
            <div className={styles.miniTopBtns}>
              <button
                type="button"
                className={styles.miniBtn}
                aria-label="Развернуть"
                onClick={goFull}
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                aria-label="Закрыть"
                onClick={doClose}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <button
            type="button"
            className={styles.miniPlay}
            aria-label={playing ? "Пауза" : "Смотреть"}
            onClick={togglePlay}
          >
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>

          <div className={styles.miniBottom}>
            <div
              className={styles.miniProgress}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seekTo(((e.clientX - r.left) / r.width) * duration);
              }}
            >
              <div className={styles.miniProgressFill} style={{ width: `${pct}%` }} />
            </div>
            <button
              type="button"
              className={styles.miniBtn}
              aria-label="Прозрачность"
              onClick={() => setOpacityOpen((o) => !o)}
            >
              <Droplet size={14} />
            </button>
            {opacityOpen && (
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.05}
                value={resolvedMini.opacity}
                className={styles.miniOpacity}
                aria-label="Прозрачность"
                onChange={(e) => setMini({ opacity: Number(e.target.value) })}
              />
            )}
          </div>

          <div className={styles.miniResize} onPointerDown={startResize} aria-hidden="true" />
        </>
      ) : (
        /* ════════ FULL CHROME ════════ */
        <>
          {scrubbing && (
            <SeekBar current={time} duration={duration} chapters={source.chapters} />
          )}

          <div className={styles.topAccent} />

          {/* Gesture feedback. Both layers are pointer-events:none, so neither can
              swallow the next tap, and neither lives in the OSD — a volume drag
              must not drag the control bar onto the screen with it. */}
          {hud ? (
            <div className={styles.hud} role="status" aria-live="polite">
              {hud.kind === "volume" ? <VolumeIcon size={22} /> : <Sun size={22} />}
              <span className={styles.hudTrack}>
                <span
                  className={styles.hudFill}
                  style={{ width: `${Math.round(hud.value * 100)}%` }}
                />
              </span>
              <span className={styles.hudValue}>{Math.round(hud.value * 100)}%</span>
            </div>
          ) : null}

          {ripple ? (
            <div
              key={ripple.id}
              className={`${styles.ripple} ${
                ripple.side === "left" ? styles.rippleLeft : styles.rippleRight
              }`}
              aria-hidden="true"
            >
              {ripple.side === "left" ? (
                <Rewind size={24} fill="currentColor" />
              ) : (
                <FastForward size={24} fill="currentColor" />
              )}
              <span className={styles.rippleLabel}>
                {ripple.side === "left" ? "−" : "+"}
                {ripple.seconds}s
              </span>
            </div>
          ) : null}

          {/* data-osd marks the player's own chrome: the gesture machine leaves
              these presses alone and TV focus stays inside them. */}
          <div className={styles.topBar} data-osd>
            <button
              type="button"
              className={styles.backBtn}
              aria-label="Назад"
              onClick={() => {
                doClose();
                router.push(source.backHref);
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <div className={styles.titleBlock}>
              <p className={styles.titleMain}>{source.title}</p>
              {source.subtitle ? <p className={styles.titleSub}>{source.subtitle}</p> : null}
            </div>
            <button
              type="button"
              className={styles.miniTrigger}
              aria-label="Свернуть в мини-плеер"
              title="Мини-плеер (I)"
              onClick={goMini}
            >
              <Minimize2 size={18} />
            </button>
          </div>

          {!playing && !scrubbing && (
            <button
              type="button"
              className={styles.bigPlay}
              aria-label="Смотреть"
              data-osd
              onClick={togglePlay}
            >
              <Play size={34} fill="currentColor" />
            </button>
          )}

          {skipTarget && controls && (
            <button
              type="button"
              className={styles.skipBtn}
              data-osd
              onClick={() => seekTo(skipTarget.to)}
            >
              {skipTarget.label}
              <SkipForward size={16} />
            </button>
          )}

          <div className={styles.bottomBar} data-osd>
            <div className={styles.metaRow}>
              <div className={styles.epInfo}>
                <p className={styles.epLabel}>{source.episodeLabel}</p>
                {source.episodeTitle ? (
                  <p className={styles.epTitle}>{source.episodeTitle}</p>
                ) : null}
              </div>
              <p className={styles.timecode}>
                {formatTime(time)} / {formatTime(duration)}
              </p>
            </div>

            <ProgressBar
              pct={pct}
              bufPct={bufPct}
              duration={duration}
              chapters={source.chapters}
              onSeek={seekTo}
            />

            <div className={styles.controlsRow}>
              <div className={styles.ctrlLeft}>
                <IconBtn label="Серии" onClick={() => router.push(source.backHref)}>
                  <ListVideo size={20} />
                </IconBtn>
                <IconBtn label="Субтитры" active={subsOn} onClick={toggleSubs}>
                  <Captions size={20} />
                </IconBtn>
                {settings.upscale !== "off" && (
                  <span className={styles.upBadge} title="Апскейл включён">
                    <Sparkles size={14} />
                    {settings.upscale === "ai-4k"
                      ? "4K"
                      : settings.upscale === "ai-2x"
                        ? "×2"
                        : "HD+"}
                  </span>
                )}
              </div>

              <div className={styles.ctrlCenter}>
                <button
                  type="button"
                  className={styles.transportBtn}
                  aria-label="Предыдущая серия"
                  disabled={!source.prevHref}
                  onClick={() => source.prevHref && router.push(source.prevHref)}
                >
                  <SkipBack size={20} fill="currentColor" />
                </button>
                <button
                  type="button"
                  ref={playBtnRef}
                  className={styles.playBtn}
                  aria-label={playing ? "Пауза" : "Смотреть"}
                  onClick={togglePlay}
                >
                  {playing ? (
                    <Pause size={26} fill="currentColor" />
                  ) : (
                    <Play size={26} fill="currentColor" />
                  )}
                </button>
                <button
                  type="button"
                  className={styles.transportBtn}
                  aria-label="Следующая серия"
                  disabled={!source.nextHref}
                  onClick={() => source.nextHref && router.push(source.nextHref)}
                >
                  <SkipForward size={20} fill="currentColor" />
                </button>
              </div>

              <div className={styles.ctrlRight}>
                <div className={styles.volume}>
                  <IconBtn label={muted ? "Включить звук" : "Выключить звук"} onClick={toggleMute}>
                    <VolumeIcon size={20} />
                  </IconBtn>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    className={styles.volumeSlider}
                    aria-label="Громкость"
                    onChange={(e) => changeVolume(Number(e.target.value))}
                  />
                </div>

                <IconBtn label="Мини-плеер" onClick={goMini}>
                  <PictureInPicture2 size={20} />
                </IconBtn>

                <div className={styles.settingsWrap}>
                  <IconBtn
                    label="Настройки"
                    active={settingsOpen}
                    badge={settings.upscale !== "off"}
                    onClick={() => {
                      setSettingsOpen((o) => !o);
                      setControls(true);
                    }}
                  >
                    <Settings size={20} />
                  </IconBtn>
                  {settingsOpen && (
                    <SettingsMenu
                      tracks={source.tracks}
                      settings={settings}
                      onUpdate={update}
                      onUpdatePrimaryStyle={updatePrimaryStyle}
                      onUpdateSecondaryStyle={updateSecondaryStyle}
                      onReset={reset}
                      qualities={qualityOptions}
                      canTranslate={canTranslate}
                      translatingLang={translatingLang}
                      onRequestLanguage={requestLanguage}
                    />
                  )}
                </div>

                <IconBtn label="Полноэкранный режим" onClick={toggleFullscreen}>
                  {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </IconBtn>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Last child, above every layer above: while a roll plays it is the only
          thing the viewer can reach. Keyed by decision so a second slot would
          get its own element rather than inherit a half-played one. */}
      {ad.slot ? (
        <AdOverlay
          key={ad.slot.decisionId}
          slot={ad.slot}
          tv={tv}
          onStart={ad.started}
          onProgress={ad.progress}
          onComplete={ad.complete}
          onSkip={ad.skip}
          onClick={ad.click}
          onFail={ad.fail}
        />
      ) : null}
    </div>
  );
}
