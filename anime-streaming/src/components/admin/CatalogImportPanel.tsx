"use client";

import { useCallback, useEffect, useState } from "react";
import { DownloadCloud, Languages, Loader2 } from "lucide-react";
import {
  fetchImportStatus,
  startEnrichment,
  startImport,
  type ImportStatus,
} from "@/lib/catalogAdmin";
import styles from "@/app/admin/admin.module.css";

const POLL_MS = 3000;

/**
 * Fills an empty production catalogue from MAL's top list and localizes it
 * (Russian titles and synopses, artwork). Runs on the server; this only starts
 * the job and follows its progress.
 */
export default function CatalogImportPanel({ onFinished }: { onFinished: () => void }) {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [pages, setPages] = useState(6);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetchImportStatus()
        .then((next) => {
          setStatus((prev) => {
            if (prev?.running && !next.running) onFinished();
            return next;
          });
        })
        .catch(() => {}),
    [onFinished]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = status?.running ?? false;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [running, refresh]);

  const run = async (action: () => Promise<ImportStatus>) => {
    setError(null);
    try {
      setStatus(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось запустить.");
    }
  };

  const percent = status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <section className={styles.card}>
      <h3>Наполнение каталога</h3>
      <p className={styles.geoHint}>
        Импорт берёт топ MyAnimeList (25 тайтлов на страницу) и пропускает уже добавленные.
        Обогащение подтягивает русские названия и описания (Shikimori) и обложки (AniList) —
        около 3 секунд на тайтл из-за лимитов источников.
      </p>
      <div className={styles.form} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Страниц:
          <input
            className={styles.input}
            type="number"
            min={1}
            max={20}
            value={pages}
            onChange={(e) => setPages(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            style={{ width: 80 }}
            disabled={running}
          />
        </label>
        <button type="button" className={styles.btnPrimary} disabled={running} onClick={() => run(() => startImport(pages))}>
          <DownloadCloud size={16} /> Импортировать топ
        </button>
        <button type="button" className={styles.btnGhost} disabled={running} onClick={() => run(startEnrichment)}>
          <Languages size={16} /> Обогатить недостающие
        </button>
      </div>
      {error ? <p className={styles.geoHint} role="alert">{error}</p> : null}
      {status?.kind ? (
        <p className={styles.geoHint} aria-live="polite">
          {running ? <Loader2 size={14} className={styles.spin} /> : null}{" "}
          {status.kind === "IMPORT" ? "Импорт" : "Обогащение"}
          {running ? ` идёт: ${status.processed} из ${status.total} (${percent}%)` : " завершено"}
          {` · добавлено ${status.added} · обогащено ${status.enriched}`}
          {status.failed ? ` · не найдено ${status.failed}` : ""}
          {status.error ? ` · ошибка: ${status.error}` : ""}
        </p>
      ) : null}
    </section>
  );
}
