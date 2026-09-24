"use client";

import { authFetch } from "@/lib/auth-client";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const CATALOG = `${API_BASE}/api/v1/admin/catalog`;

export interface ImportStatus {
  kind: "IMPORT" | "ENRICH" | null;
  running: boolean;
  processed: number;
  total: number;
  added: number;
  enriched: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Ошибка ${res.status}`);
  }
  return (await res.json()) as T;
}

export const fetchImportStatus = async () => json<ImportStatus>(await authFetch(`${CATALOG}/status`));

export const startImport = async (pages: number) =>
  json<ImportStatus>(
    await authFetch(`${CATALOG}/import`, { method: "POST", body: JSON.stringify({ pages }) })
  );

export const startEnrichment = async () =>
  json<ImportStatus>(await authFetch(`${CATALOG}/enrich`, { method: "POST" }));
