"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus } from "lucide-react";
import styles from "@/app/admin/admin.module.css";

/**
 * Interactive world map for the geo rules.
 *
 * Country outlines are pre-projected (Robinson) at build time into
 * `/world-110m.json`, so the browser only pays for one fetch and a list of
 * `<path>` nodes — no projection library, no runtime topology decoding.
 *
 * Navigation is done by moving the SVG viewBox rather than CSS transforms: paths
 * stay vector-sharp at every zoom level, hit-testing keeps working, and the
 * stroke width can be scaled down as you zoom in so borders never turn into fat
 * blobs. Wheel zooms toward the cursor, drag pans, double-click zooms in, and the
 * keyboard has the same controls for anyone not using a mouse.
 */

interface Country {
  name: string;
  d: string;
}

interface Atlas {
  width: number;
  height: number;
  countries: Record<string, Country>;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
/** Vertical trim of the empty polar bands in the source frame. */
const TOP_TRIM = 12;
const BOTTOM_TRIM = 96;

export default function WorldMap({
  blocked,
  refusals,
  selected,
  onSelect,
}: {
  blocked: Set<string>;
  refusals: Record<string, number>;
  selected: string | null;
  onSelect: (code: string, name: string) => void;
}) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [hover, setHover] = useState<{ code: string; name: string; x: number; y: number } | null>(
    null
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  // The pointer session itself stays in a ref (it is written from pointer
  // handlers many times per second), but the cursor styling needs it during
  // render — so the on/off edge is mirrored into state.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/world-110m.json")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAtlas(data as Atlas);
      })
      .catch(() => setAtlas({ width: 1000, height: 566, countries: {} }));
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo(() => Object.entries(atlas?.countries ?? {}), [atlas]);

  const frame = useMemo(() => {
    const width = atlas?.width ?? 1000;
    const fullHeight = (atlas?.height ?? 566) - TOP_TRIM - BOTTOM_TRIM;
    const w = width / zoom;
    const h = fullHeight / zoom;
    // Clamp so panning can never leave the world behind an empty canvas.
    const x = Math.min(Math.max(center.x * width - w / 2, 0), Math.max(0, width - w));
    const y = Math.min(
      Math.max(center.y * fullHeight - h / 2 + TOP_TRIM, TOP_TRIM),
      Math.max(TOP_TRIM, fullHeight + TOP_TRIM - h)
    );
    return { x, y, w, h, width, fullHeight };
  }, [atlas, zoom, center]);

  const zoomAt = useCallback(
    (factor: number, focus?: { x: number; y: number }) => {
      setZoom((current) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor));
        if (focus && next !== current) {
          // Keep the point under the cursor pinned while the scale changes.
          setCenter((c) => ({
            x: c.x + (focus.x - c.x) * (1 - current / next),
            y: c.y + (focus.y - c.y) * (1 - current / next),
          }));
        }
        if (next === MIN_ZOOM) setCenter({ x: 0.5, y: 0.5 });
        return next;
      });
    },
    []
  );

  const pointToUnit = useCallback(
    (clientX: number, clientY: number) => {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box) return { x: 0.5, y: 0.5 };
      const px = (clientX - box.left) / box.width;
      const py = (clientY - box.top) / box.height;
      return {
        x: (frame.x + px * frame.w) / frame.width,
        y: (frame.y - TOP_TRIM + py * frame.h) / frame.fullHeight,
      };
    },
    [frame]
  );

  return (
    <div className={styles.mapWrap} ref={wrapRef} data-loading={atlas === null}>
      <svg
        ref={svgRef}
        viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
        role="img"
        aria-label="Карта мира с правилами доступа"
        data-dragging={dragging}
        onWheel={(e) => {
          if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
          zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, pointToUnit(e.clientX, e.clientY));
        }}
        onDoubleClick={(e) => zoomAt(1.8, pointToUnit(e.clientX, e.clientY))}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y, moved: false };
          setDragging(true);
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const box = svgRef.current?.getBoundingClientRect();
          if (!box) return;
          const dx = (e.clientX - d.x) / box.width;
          const dy = (e.clientY - d.y) / box.height;
          if (Math.abs(dx) + Math.abs(dy) > 0.004) d.moved = true;
          setCenter({
            x: Math.min(1, Math.max(0, d.cx - dx / zoom)),
            y: Math.min(1, Math.max(0, d.cy - dy / zoom)),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          drag.current = null;
          setDragging(false);
          setHover(null);
        }}
      >
        <defs>
          <radialGradient id="oceanGlow" cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor="rgba(255,77,90,0.10)" />
            <stop offset="100%" stopColor="rgba(255,77,90,0)" />
          </radialGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width={atlas?.width ?? 1000}
          height={atlas?.height ?? 566}
          fill="url(#oceanGlow)"
        />
        {entries.map(([code, country]) => {
          const isBlocked = blocked.has(code);
          const hits = refusals[code] ?? 0;
          return (
            <path
              key={code}
              d={country.d}
              className={styles.country}
              data-blocked={isBlocked}
              data-selected={selected === code}
              data-hits={hits > 0 ? true : undefined}
              // Borders keep a constant on-screen weight as the map scales.
              strokeWidth={0.4 / zoom}
              tabIndex={0}
              role="button"
              aria-label={`${country.name}: ${isBlocked ? "заблокирована" : "разрешена"}`}
              onClick={() => {
                // A pan that ends over a country must not also select it.
                if (drag.current?.moved) return;
                onSelect(code, country.name);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(code, country.name);
                }
              }}
              onMouseMove={(e) => {
                const box = wrapRef.current?.getBoundingClientRect();
                setHover({
                  code,
                  name: country.name,
                  x: e.clientX - (box?.left ?? 0),
                  y: e.clientY - (box?.top ?? 0),
                });
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>

      {hover ? (
        <span className={styles.mapTip} style={{ left: hover.x, top: hover.y }}>
          <b>{hover.name}</b>
          <em>{blocked.has(hover.code) ? "Заблокирована" : "Разрешена"}</em>
          {refusals[hover.code] ? <i>{refusals[hover.code]} отказов</i> : null}
        </span>
      ) : null}

      <div className={styles.mapControls}>
        <button type="button" onClick={() => zoomAt(1.4)} aria-label="Приблизить">
          <Plus size={16} />
        </button>
        <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label="Отдалить">
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setCenter({ x: 0.5, y: 0.5 });
          }}
          aria-label="Сбросить вид"
        >
          <Crosshair size={16} />
        </button>
        <span className={styles.zoomLabel}>{zoom.toFixed(1)}×</span>
      </div>

      <div className={styles.mapLegend}>
        <span data-kind="allowed">Разрешены</span>
        <span data-kind="blocked">Заблокированы</span>
        <span data-kind="selected">Выбрана</span>
        <span data-kind="count">
          {blocked.size} заблокировано из {entries.length} · колесо — масштаб, перетаскивание — перемещение
        </span>
      </div>
    </div>
  );
}
