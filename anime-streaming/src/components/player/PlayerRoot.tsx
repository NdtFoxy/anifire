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
import { cueAt } from "@/lib/subtitles";
import { upscaleFilter } from "@/lib/upscale";
import type { Chapter } from "./types";
import { formatTime } from "./format";
import { usePlayerSettings } from "./usePlayerSettings";
import { usePlayer, type MiniLayout } from "./PlayerProvider";
import { fetchTranslatedTrack } from "@/data/animeApi";
import SubtitleOverlay from "./SubtitleOverlay";
import SettingsMenu from "./SettingsMenu";
import SeekBar from "./SeekBar";
import AdOverlay from "./AdOverlay";
import { useAdPlan } from "./useAdPlan";
import { useWatchProgress } from "./useWatchProgress";
import { useStudy } from "./useStudy";
import WordCard from "./WordCard";
import type { LineToken } from "./SubtitleLine";
import { useAuth } from "@/components/auth/AuthProvider";
import styles from "./player.module.css";

const SEEK_STEP = 5;
/** Remotes are coarse: a couch seek moves in bigger jumps than a keyboard. */
const TV_SEEK_STEP = 10;
/** Touch double-tap seek, matching every mobile player's muscle memory. */
const TAP_SEEK_STEP = 10;
const HIDE_DELAY = 2600;
/** A remote user needs longer to read the OSD than a mouse user needs to move. */
const TV_HIDE_DELAY = 4000;
const SCRUB_HIDE = 1400;
const HUD_HIDE = 900;
const DOUBLE_TAP_MS = 300;
/** Below this the finger is still "a tap", above it the drag owns the gesture. */
const DRAG_SLOP = 12;
/** A press held longer than this is a finger resting, not a tap. */
const LONG_PRESS_MS = 700;
/** How long the ∓10s double-tap ripple stays on screen. */
const RIPPLE_MS = 520;
/** A full vertical drag spans 60% of the picture — one comfortable thumb. */
const DRAG_SWING = 0.6;
/** Emulated screen brightness (a CSS filter, not the real backlight). */
const BRIGHT_MIN = 0.25;
const BRIGHT_MAX = 1.6;
const ASPECT = 9 / 16;
const MINI_MIN = 260;
const MINI_MAX = 760;

/** Which third of the picture a tap landed in. */
type TapZone = "left" | "mid" | "right";

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
  /** The OSD control that had focus when the bar last auto-hid (TV). */
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const mediaKeyRef = useRef<string | null>(null);
  /** Which pointer kind opened the current interaction. A touch tap must never
      fall through to the desktop click-to-play handler. */
  const pointerKindRef = useRef<string>("mouse");
  /** The live touch gesture. One record drives tap, double-tap and drag, so the
      three can never fire twice for the same finger. */
  const gestureRef = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    width: number;
    height: number;
    at: number;
    axis: "undecided" | "tap" | "volume" | "brightness";
    baseVolume: number;
    baseBrightness: number;
  } | null>(null);
  /** Previous tap, for double-tap detection inside the same third. */
  const lastTapRef = useRef<{ at: number; zone: TapZone } | null>(null);
  /** Bumped per ripple so React remounts the element and replays the animation. */
  const rippleSeq = useRef(0);

  const tracks = useMemo(() => source?.tracks ?? [], [source]);
  const { settings, update, updatePrimaryStyle, updateSecondaryStyle, reset } =
    usePlayerSettings(tracks);

  // On-demand LLM subtitle translation requested from the settings menu.
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const canTranslate = (!!source?.anilistId || !!source?.malId) && source?.episode != null;
  const requestLanguage = useCallback(
    async (lang: string) => {
      const q = lang.trim();
      if (!q || (!source?.anilistId && !source?.malId) || source.episode == null) return;
      setTranslatingLang(q);
      try {
        const track = await fetchTranslatedTrack(
          { anilistId: source.anilistId, malId: source.malId, episode: source.episode },
          q
        );
        if (track) {
          mergeTracks([track]);
          // Show it right away: fill primary if empty, else the secondary slot.
          update({
            selection: settings.selection.primary
              ? { ...settings.selection, secondary: track.id }
              : { ...settings.selection, primary: track.id },
          });
        }
      } finally {
        setTranslatingLang(null);
      }
    },
    [source?.anilistId, source?.malId, source?.episode, mergeTracks, update, settings.selection]
  );
  const qualityOptions = useMemo(() => {
    const labels = source?.qualities?.map((q) => q.label).filter(Boolean) ?? [];
    return ["Auto", ...(labels.length ? labels : ["1080p", "720p", "480p"])];
  }, [source?.qualities]);
  const activeSrc = useMemo(() => {
    if (!source) return undefined;
    if (settings.quality === "Auto" || settings.quality === "Auto") {
      return source.qualities?.[0]?.src ?? source.src;
    }
    return source.qualities?.find((q) => q.label === settings.quality)?.src ?? source.src;
  }, [source, settings.quality]);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controls, setControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const [studyWord, setStudyWord] = useState<
    { token: LineToken; line: string; translation: string | null } | null
  >(null);

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
  const [drag, setDrag] = useState<Pick<MiniLayout, "x" | "y" | "width"> | null>(
    null
  );
  const [opacityOpen, setOpacityOpen] = useState(false);
  /** Transient centre HUD for volume/brightness gestures and D-pad volume. */
  const [hud, setHud] = useState<{
    kind: "volume" | "brightness";
    value: number;
  } | null>(null);
  /** Double-tap seek feedback: which third was hit and how far it jumped. */
  const [ripple, setRipple] = useState<{
    side: "left" | "right";
    seconds: number;
    id: number;
  } | null>(null);
  /** Screen brightness emulated as a CSS filter (phone left-half drag). */
  const [brightness, setBrightness] = useState(1);

  const hideTimer = useRef<number | null>(null);
  const scrubTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hudTimer = useRef<number | null>(null);
  const rippleTimer = useRef<number | null>(null);
  /** Autorepeat accumulator so a held D-pad direction accelerates. */
  const holdRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });

  /** Viewport size as state rather than a render-time `window` read: the mini
      window must stay on screen after a rotate, and reading window during render
      desyncs the server pass from hydration. */
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const sync = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  /* ─────────── media events ─────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => setDuration(v.duration || 0);
    const onProgress = () => {
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setTime(v.currentTime);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("durationchange", onLoaded);
    v.addEventListener("progress", onProgress);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("durationchange", onLoaded);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [source?.key]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const v = videoRef.current;
      if (v) setTime(v.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = settings.playbackRate;
  }, [settings.playbackRate]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeSrc) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;
    const isSameMedia = mediaKeyRef.current === source?.key;
    // A deep link asks for one specific second; otherwise keep the position we
    // already had when only the quality changed.
    const resumeAt = isSameMedia ? v.currentTime : requestedStart ?? 0;
    const shouldResume = isSameMedia && !v.paused && !v.ended;
    const restorePlayback = () => {
      if (resumeAt > 0 && Number.isFinite(v.duration)) {
        v.currentTime = Math.min(resumeAt, Math.max(0, v.duration - 0.2));
      }
      if (shouldResume) v.play().catch(() => {});
    };
    mediaKeyRef.current = source?.key ?? null;

    v.addEventListener("loadedmetadata", restorePlayback, { once: true });
    const isHls = activeSrc.includes(".m3u8");

    if (!isHls) {
      v.src = activeSrc;
      v.load();
      return () => {
        v.removeEventListener("loadedmetadata", restorePlayback);
        v.removeAttribute("src");
        v.load();
      };
    }

    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = activeSrc;
      v.load();
      return () => {
        v.removeEventListener("loadedmetadata", restorePlayback);
        v.removeAttribute("src");
        v.load();
      };
    }

    import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !videoRef.current) return;
      if (!Hls.isSupported()) {
        videoRef.current.src = activeSrc;
        videoRef.current.load();
        return;
      }
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(activeSrc);
      hls.attachMedia(videoRef.current);
      cleanup = () => hls.destroy();
    });

    return () => {
      cancelled = true;
      cleanup?.();
      v.removeEventListener("loadedmetadata", restorePlayback);
      if (v) {
        v.removeAttribute("src");
        v.load();
      }
    };
  }, [activeSrc, source?.key, requestedStart]);

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

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      // Silent for the whole roll; the viewer's own mute state returns with it.
      v.muted = muted || adRunning;
    }
  }, [volume, muted, adRunning]);

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

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const mediaDuration =
        Number.isFinite(duration) && duration > 0
          ? duration
          : Number.isFinite(v.duration) && v.duration > 0
            ? v.duration
            : Number.POSITIVE_INFINITY;
      const clamped = Math.max(
        0,
        mediaDuration === Number.POSITIVE_INFINITY ? t : Math.min(t, mediaDuration)
      );
      v.currentTime = clamped;
      setTime(clamped);
    },
    [duration]
  );

  /** Centre HUD flash — feedback for gestures/D-pad that must NOT open the OSD. */
  const flashHud = useCallback((kind: "volume" | "brightness", value: number) => {
    setHud({ kind, value });
    if (hudTimer.current) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHud(null), HUD_HIDE);
  }, []);

  const hideDelay = tv ? TV_HIDE_DELAY : HIDE_DELAY;
  const showControls = useCallback(() => {
    setScrubbing(false);
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!settingsOpen) setControls(false);
    }, hideDelay);
  }, [settingsOpen, hideDelay]);

  /** Relative seek with no chrome side-effects — what touch double-tap wants. */
  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      seekTo(v.currentTime + delta);
    },
    [seekTo]
  );

  /** Keyboard/D-pad seek: swaps the OSD for the thin scrub bar while jumping. */
  const nudge = useCallback(
    (delta: number) => {
      seekBy(delta);
      setControls(false);
      setScrubbing(true);
      if (scrubTimer.current) window.clearTimeout(scrubTimer.current);
      scrubTimer.current = window.setTimeout(() => setScrubbing(false), SCRUB_HIDE);
    },
    [seekBy]
  );

  const changeVolume = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(1, value));
      setVolume(next);
      setMuted(next === 0);
    },
    []
  );

  /** Volume step that reports itself in the HUD instead of opening the OSD. */
  const bumpVolume = useCallback(
    (delta: number) => {
      setVolume((v) => {
        const next = Math.max(0, Math.min(1, v + delta));
        setMuted(next === 0);
        flashHud("volume", next);
        return next;
      });
    },
    [flashHud]
  );

  /** Fullscreen. A phone player is a landscape-first surface, so once we own the
      screen we ask for a landscape lock — only legal while fullscreen, and
      silently unsupported on desktop and iOS. */
  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    };
    if (document.fullscreenElement) {
      orientation?.unlock?.();
      document.exitFullscreen().catch(() => {});
      return;
    }
    shell.requestFullscreen().then(
      () => {
        if (device === "phone") orientation?.lock?.("landscape").catch(() => {});
      },
      () => {}
    );
  }, [device]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const goMini = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setSettingsOpen(false);
    minimize();
    if (source) router.push(source.backHref);
  }, [minimize, router, source]);

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

  /* ─────────── keyboard / D-pad (full mode only) ───────────
   *
   * INPUT-MODE STATE MACHINE
   * ────────────────────────
   *   pointer / keyboard (desktop)  → unchanged parity: space·k play, ←→ seek 5s,
   *                                   ↑↓ volume, f fullscreen, m mute, c subs,
   *                                   i mini, Escape closes the settings menu.
   *
   *   remote (TV or anyone driving a D-pad) → two sub-states:
   *     A. OSD HIDDEN  — the *player* owns the arrows. ←/→ seek ∓TV_SEEK_STEP with
   *        hold-to-repeat acceleration, ↑/↓ change volume with a transient HUD,
   *        Enter/MediaPlayPause toggles play, Back/Escape exits fullscreen or
   *        drops to the mini player. Every one of those calls preventDefault(),
   *        and SpatialNav bails on `event.defaultPrevented`, so focus never moves
   *        — no double handling. Any other remote key wakes the OSD.
   *     B. OSD OPEN    — the *OSD* owns the arrows. We deliberately do NOT call
   *        preventDefault for direction keys, so SpatialNav walks focus between
   *        the OSD buttons and Enter clicks the focused one; we only refresh the
   *        auto-hide timer. Back/Escape closes the menu, then the OSD.
   *
   * The listener is registered in the CAPTURE phase so this switch is decided
   * before SpatialNav's bubble-phase handler ever sees the key, regardless of
   * which component mounted first.
   */
  useEffect(() => {
    // A roll owns the keyboard: AdOverlay swallows the keys that would seek,
    // pause or navigate out of an ad the advertiser has already been sold.
    if (mode !== "full" || adRunning) return;

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable)
        return;

      if (isRemote) {
        // Transport keys work in both sub-states.
        if (e.key === "MediaPlayPause" || e.key === "MediaPlay" || e.key === "MediaPause") {
          e.preventDefault();
          togglePlay();
          showControls();
          return;
        }
        if (
          e.key === "Escape" ||
          e.key === "GoBack" ||
          e.key === "BrowserBack" ||
          e.key === "Backspace"
        ) {
          e.preventDefault();
          if (settingsOpen) setSettingsOpen(false);
          else if (controls) setControls(false);
          else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else goMini();
          return;
        }

        // ── B. OSD open: hands the arrows to SpatialNav. ──
        if (controls || settingsOpen) {
          showControls(); // any input keeps the bar alive
          return;
        }

        // ── A. OSD hidden: the player owns the D-pad. ──
        const hold = holdRef.current;
        if (hold.key === e.key) hold.count += 1;
        else holdRef.current = { key: e.key, count: 0 };
        // Accelerate a held direction: 10s → 20s → 30s, capped at 60s a press.
        const step = Math.min(TV_SEEK_STEP * (1 + Math.floor(holdRef.current.count / 4)), 60);

        switch (e.key) {
          case "ArrowRight":
            e.preventDefault();
            nudge(step);
            return;
          case "ArrowLeft":
            e.preventDefault();
            nudge(-step);
            return;
          case "ArrowUp":
            e.preventDefault();
            bumpVolume(0.05);
            return;
          case "ArrowDown":
            e.preventDefault();
            bumpVolume(-0.05);
            return;
          case "Enter":
          case " ":
            e.preventDefault();
            togglePlay();
            showControls();
            return;
          default:
            // "reappears on any remote key"
            showControls();
            return;
        }
      }

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          showControls();
          break;
        case "ArrowRight":
          e.preventDefault();
          nudge(SEEK_STEP);
          break;
        case "ArrowLeft":
          e.preventDefault();
          nudge(-SEEK_STEP);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(volume + 0.1);
          showControls();
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(volume - 0.1);
          showControls();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "i":
          goMini();
          break;
        case "m":
          setMuted((m) => !m);
          showControls();
          break;
        case "c":
          setSubsOn((s) => !s);
          showControls();
          break;
        case "Escape":
          setSettingsOpen(false);
          break;
        default:
          break;
      }
    };
    const onKeyUp = () => {
      holdRef.current = { key: "", count: 0 };
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [
    mode,
    adRunning,
    isRemote,
    controls,
    settingsOpen,
    togglePlay,
    nudge,
    changeVolume,
    bumpVolume,
    volume,
    toggleFullscreen,
    showControls,
    goMini,
  ]);

  /* On TV the OSD is also the focus surface: remember which control the user was
     on when the bar auto-hides, restore it when the bar comes back, and drop
     focus while it is hidden so SpatialNav never targets an invisible button.
     `isChrome` matches the [data-osd] regions, which are the only focusables the
     player owns. */
  useEffect(() => {
    // The roll's Skip button is the focus surface while an ad plays; the OSD
    // behind it is hidden and cannot be focused at all.
    if (!tv || mode !== "full" || adRunning) return;
    if (!controls) {
      const active = document.activeElement as HTMLElement | null;
      if (active && isChrome(active)) {
        lastFocusRef.current = active;
        active.blur();
      }
      return;
    }
    const id = window.requestAnimationFrame(() => {
      const remembered = lastFocusRef.current;
      const target =
        remembered && remembered.isConnected && isChrome(remembered)
          ? remembered
          : playBtnRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [tv, mode, controls, adRunning]);

  /* While the OSD is open it is the ONLY focus surface. SpatialNav walks the
     whole document, so if the D-pad wanders onto something behind the overlay we
     pull focus back to the last OSD control instead of letting it vanish. */
  useEffect(() => {
    if (!tv || mode !== "full" || !controls || adRunning) return;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el === document.body) return;
      if (isChrome(el)) {
        lastFocusRef.current = el;
        return;
      }
      const back = lastFocusRef.current?.isConnected
        ? lastFocusRef.current
        : playBtnRef.current;
      back?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [tv, mode, controls, adRunning]);

  /* Every timer this component owns, released together. */
  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (scrubTimer.current) window.clearTimeout(scrubTimer.current);
      if (hudTimer.current) window.clearTimeout(hudTimer.current);
      if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    },
    []
  );

  /* ─────────── auto-skip intro ─────────── */
  useEffect(() => {
    if (!settings.autoSkipIntro || !source) return;
    const inIntro = activeChapter(source.chapters, time, "intro");
    if (inIntro && time < inIntro.end - 0.3) seekTo(inIntro.end + 0.5);
  }, [time, settings.autoSkipIntro, source, seekTo]);

  /* ─────────── mini drag / resize ─────────── */
  const resolvedMini = useMemo<MiniLayout>(() => {
    const vw = viewport.w || 1280;
    const vh = viewport.h || 720;
    // The window must fit the screen it is on: a desktop-sized mini player has
    // to survive a rotate into a 390px-wide phone, and it must never hide under
    // the phone tab bar.
    const nav = navReserve();
    const maxWidth = Math.min(MINI_MAX, vw - 16, (vh - 16 - nav) / ASPECT);
    const width = Math.max(160, Math.min(drag?.width ?? mini.width, maxWidth));
    const height = width * ASPECT;
    let x = drag?.x ?? mini.x;
    let y = drag?.y ?? mini.y;
    if (x < 0) x = vw - width - 24;
    if (y < 0) y = vh - height - nav - 24;
    x = Math.max(8, Math.min(x, vw - width - 8));
    y = Math.max(8, Math.min(y, vh - height - nav - 8));
    return { x, y, width, opacity: mini.opacity };
  }, [drag, mini, viewport]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const base = { x: resolvedMini.x, y: resolvedMini.y, width: resolvedMini.width };
      const move = (ev: PointerEvent) => {
        setDrag({
          width: base.width,
          x: base.x + (ev.clientX - startX),
          y: base.y + (ev.clientY - startY),
        });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setDrag((d) => {
          if (d) setMini({ x: clampX(d.x, d.width), y: clampY(d.y, d.width) });
          return null;
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [resolvedMini, setMini]
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const baseW = resolvedMini.width;
      const baseX = resolvedMini.x;
      const baseY = resolvedMini.y;
      const move = (ev: PointerEvent) => {
        const width = Math.max(MINI_MIN, Math.min(MINI_MAX, baseW + (ev.clientX - startX)));
        setDrag({ x: baseX, y: baseY, width });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setDrag((d) => {
          if (d) setMini({ width: d.width });
          return null;
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [resolvedMini, setMini]
  );

  /* ─────────── touch gestures (full mode) ───────────
   *
   * One pointer machine owns every finger interaction, so no gesture is handled
   * twice and none of them can fight the OSD:
   *   single tap             → toggles the OSD. It must NEVER toggle playback —
   *                            that was the bug: the shell's onClick called
   *                            togglePlay() for taps as well as mouse clicks, so
   *                            reaching for the controls paused the episode.
   *   double tap outer third → seeks ∓TAP_SEEK_STEP with a ripple on that side.
   *   double tap centre      → play/pause, the deliberate way to stop on a phone.
   *   vertical drag, right   → volume; left → brightness (a CSS filter). Both
   *                            report in the centre HUD, never in the OSD.
   * Presses that land on [data-osd] chrome are left alone: those buttons own
   * their own clicks. Mouse and pen keep desktop click-to-play via onShellClick.
   */
  const flashRipple = useCallback((side: "left" | "right", seconds: number) => {
    rippleSeq.current += 1;
    setRipple({ side, seconds, id: rippleSeq.current });
    if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    rippleTimer.current = window.setTimeout(() => setRipple(null), RIPPLE_MS);
  }, []);

  const onShellPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerKindRef.current = e.pointerType;
      if (e.pointerType !== "touch" || isChrome(e.target)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      gestureRef.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        at: Date.now(),
        axis: "undecided",
        baseVolume: muted ? 0 : volume,
        baseBrightness: brightness,
      };
      // Capture, so a drag that wanders over the control bar still reports here.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [muted, volume, brightness]
  );

  const onShellPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.axis === "undecided") {
        if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
        // Only a clearly vertical move becomes a drag; a sideways smudge stays a
        // tap, so a shaky finger never loses its tap.
        if (Math.abs(dy) <= Math.abs(dx)) {
          g.axis = "tap";
          return;
        }
        g.axis = g.x - g.left < g.width / 2 ? "brightness" : "volume";
      }
      if (g.axis === "tap") return;
      const ratio = -dy / Math.max(1, g.height * DRAG_SWING);
      if (g.axis === "volume") {
        const next = Math.max(0, Math.min(1, g.baseVolume + ratio));
        setVolume(next);
        setMuted(next === 0);
        flashHud("volume", next);
      } else {
        const span = BRIGHT_MAX - BRIGHT_MIN;
        const next = Math.max(
          BRIGHT_MIN,
          Math.min(BRIGHT_MAX, g.baseBrightness + ratio * span)
        );
        setBrightness(next);
        flashHud("brightness", (next - BRIGHT_MIN) / span);
      }
    },
    [flashHud]
  );

  const onShellPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.id !== e.pointerId) return;
      if (g.axis === "volume" || g.axis === "brightness") return; // drag spent it
      const now = Date.now();
      if (now - g.at > LONG_PRESS_MS) return;

      const offset = e.clientX - g.left;
      const zone: TapZone =
        offset < g.width / 3 ? "left" : offset > (g.width * 2) / 3 ? "right" : "mid";
      const previous = lastTapRef.current;
      const isDouble =
        !!previous && previous.zone === zone && now - previous.at < DOUBLE_TAP_MS;
      lastTapRef.current = isDouble ? null : { at: now, zone };

      if (isDouble) {
        if (zone === "mid") togglePlay();
        else {
          seekBy(zone === "left" ? -TAP_SEEK_STEP : TAP_SEEK_STEP);
          flashRipple(zone, TAP_SEEK_STEP);
        }
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (controls) {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        setControls(false);
      } else {
        showControls();
      }
    },
    [controls, settingsOpen, showControls, togglePlay, seekBy, flashRipple]
  );

  /** A cancelled pointer (system gesture, call, palm) is not a tap. */
  const onShellPointerCancel = useCallback(() => {
    gestureRef.current = null;
  }, []);

  /** Mouse and pen only: clicking the picture toggles playback, as on every
      desktop player. Touch never reaches this — pointerKindRef gates it. */
  const onShellClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (pointerKindRef.current === "touch" || isChrome(e.target)) return;
      if (settingsOpen) setSettingsOpen(false);
      else togglePlay();
    },
    [settingsOpen, togglePlay]
  );

  /** Browsers synthesize a mousemove after a tap; without this guard it would
      re-open the OSD that the very same tap just closed. */
  const onShellMouseMove = useCallback(() => {
    if (pointerKindRef.current === "touch") return;
    showControls();
  }, [showControls]);

  if (!source || mode === "closed") return null;

  const isMini = mode === "mini";
  const miniHeight = resolvedMini.width * ASPECT;
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

  const skipTarget = (() => {
    if (isMini) return null;
    const intro = activeChapter(source.chapters, time, "intro");
    const outro = activeChapter(source.chapters, time, "outro");
    if (intro) return { label: "Skip intro", to: intro.end + 0.5 };
    if (outro) return { label: "Skip outro", to: outro.end + 0.5 };
    return null;
  })();

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
          than a paused mid-scene. Clicks pass through to toggle play. */}
      {!playing && source.poster ? (
        <img
          src={source.poster}
          alt=""
          aria-hidden="true"
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
          onWord={(token, line) => {
            // Reading a definition over moving subtitles loses both — pause first.
            videoRef.current?.pause();
            // The same moment on the secondary track is the sentence translated by
            // a human. It costs nothing here: the cue is already loaded and the
            // timestamps line up, which is exactly why the pair is worth showing.
            const other = settings.selection.secondary
              ? source?.tracks?.find((t) => t.id === settings.selection.secondary)
              : undefined;
            const parallel = other ? cueAt(other.cues, videoRef.current?.currentTime ?? time)?.text : null;
            setStudyWord({ token, line, translation: parallel ?? null });
          }}
        />
      )}

      {studyWord ? (
        <WordCard
          token={studyWord.token}
          line={studyWord.line}
          translation={studyWord.translation}
          onMark={(status) => {
            void study.mark(studyWord.token.lemma, status, {
              line: studyWord.line,
              surface: studyWord.token.surface,
              timeSec: videoRef.current?.currentTime,
            });
            setStudyWord(null);
          }}
          onClose={() => setStudyWord(null)}
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
                aria-label="Maximize"
                onClick={goFull}
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                aria-label="Close"
                onClick={doClose}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <button
            type="button"
            className={styles.miniPlay}
            aria-label={playing ? "Pause" : "Play"}
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
              aria-label="Opacity"
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
                aria-label="Opacity"
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
              aria-label="Back"
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
              aria-label="Minimize to mini player"
              title="Mini player (I)"
              onClick={goMini}
            >
              <Minimize2 size={18} />
            </button>
          </div>

          {!playing && !scrubbing && (
            <button
              type="button"
              className={styles.bigPlay}
              aria-label="Play"
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

            <Progress
              pct={pct}
              bufPct={bufPct}
              duration={duration}
              chapters={source.chapters}
              onSeek={seekTo}
            />

            <div className={styles.controlsRow}>
              <div className={styles.ctrlLeft}>
                <IconBtn label="Episodes" onClick={() => router.push(source.backHref)}>
                  <ListVideo size={20} />
                </IconBtn>
                <IconBtn label="Subtitles" active={subsOn} onClick={() => setSubsOn((s) => !s)}>
                  <Captions size={20} />
                </IconBtn>
                {settings.upscale !== "off" && (
                  <span className={styles.upBadge} title="Upscale on">
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
                  aria-label="Previous episode"
                  disabled={!source.prevHref}
                  onClick={() => source.prevHref && router.push(source.prevHref)}
                >
                  <SkipBack size={20} fill="currentColor" />
                </button>
                <button
                  type="button"
                  ref={playBtnRef}
                  className={styles.playBtn}
                  aria-label={playing ? "Pause" : "Play"}
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
                  aria-label="Next episode"
                  disabled={!source.nextHref}
                  onClick={() => source.nextHref && router.push(source.nextHref)}
                >
                  <SkipForward size={20} fill="currentColor" />
                </button>
              </div>

              <div className={styles.ctrlRight}>
                <div className={styles.volume}>
                  <IconBtn
                    label={muted ? "Unmute" : "Mute"}
                    onClick={() => setMuted((m) => !m)}
                  >
                    <VolumeIcon size={20} />
                  </IconBtn>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    className={styles.volumeSlider}
                    aria-label="Volume"
                    onChange={(e) => changeVolume(Number(e.target.value))}
                  />
                </div>

                <IconBtn label="Mini player" onClick={goMini}>
                  <PictureInPicture2 size={20} />
                </IconBtn>

                <div className={styles.settingsWrap}>
                  <IconBtn
                    label="Settings"
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

                <IconBtn label="Fullscreen" onClick={toggleFullscreen}>
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

/* ───────────────────────── helpers ───────────────────────── */

/**
 * Is this node part of the player's own chrome? Every OSD region carries
 * `data-osd`, which makes one predicate serve both jobs: the touch gesture
 * machine ignores presses that land on a control, and TV focus knows which
 * elements belong to the OSD.
 */
function isChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-osd]") !== null;
}

/**
 * Height the phone tab bar reserves, read from the shared `--mobile-nav-h`
 * token so the mini window and the CSS can never disagree about it.
 */
function navReserve() {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--mobile-nav-h"
  );
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}

function clampX(x: number, width: number) {
  if (typeof window === "undefined") return x;
  return Math.max(8, Math.min(x, window.innerWidth - width - 8));
}
function clampY(y: number, width: number) {
  if (typeof window === "undefined") return y;
  return Math.max(
    8,
    Math.min(y, window.innerHeight - width * ASPECT - navReserve() - 8)
  );
}

function activeChapter(
  chapters: Chapter[],
  time: number,
  kind: Chapter["kind"]
): Chapter | null {
  return (
    chapters.find((c) => c.kind === kind && time >= c.start && time <= c.end) ??
    null
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  badge,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.iconBtn} ${active ? styles.iconActive : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {badge ? <span className={styles.iconBadge} /> : null}
    </button>
  );
}

function Progress({
  pct,
  bufPct,
  duration,
  chapters,
  onSeek,
}: {
  pct: number;
  bufPct: number;
  duration: number;
  chapters: Chapter[];
  onSeek: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const ratioFromEvent = (clientX: number) => {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  return (
    <div
      ref={barRef}
      className={styles.progress}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round((pct / 100) * duration)}
      tabIndex={0}
      onMouseMove={(e) => setHoverPct(ratioFromEvent(e.clientX) * 100)}
      onMouseLeave={() => setHoverPct(null)}
      onClick={(e) => onSeek(ratioFromEvent(e.clientX) * duration)}
    >
      <div className={styles.progressTrack}>
        <div className={styles.progressBuffer} style={{ width: `${bufPct}%` }} />
        {hoverPct !== null && (
          <div className={styles.progressHover} style={{ width: `${hoverPct}%` }} />
        )}
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        {duration > 0 &&
          chapters.map((c, i) => (
            <span
              key={i}
              className={`${styles.chapterTick} ${styles[c.kind] ?? ""}`}
              style={{
                left: `${(c.start / duration) * 100}%`,
                width: `${((c.end - c.start) / duration) * 100}%`,
              }}
              title={c.label ?? c.kind}
            />
          ))}
      </div>
      <span className={styles.progressKnob} style={{ left: `${pct}%` }} />
    </div>
  );
}
