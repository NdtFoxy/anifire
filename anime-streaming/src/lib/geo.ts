"use client";

import { authFetch } from "@/lib/auth-client";

/** Geo access rules. Admin-only: every endpoint sits under /api/v1/admin. */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const GEO = `${API_BASE}/api/v1/admin/geo`;

/** Header an admin sends to preview the site as a visitor from one country. */
export const SIMULATE_HEADER = "X-Geo-Simulate";
const SIMULATE_KEY = "anifire.geo.simulate";

export interface GeoRule {
  country: string;
  blocked: boolean;
  note: string | null;
  updatedAt: string;
}

export interface GeoOverview {
  enabled: boolean;
  blocked: string[];
  rules: GeoRule[];
  refusals: Record<string, number>;
  refusalTotal: number;
}

export interface GeoAuditEntry {
  country: string;
  blocked: boolean;
  note: string | null;
  actorEmail: string | null;
  at: string;
}

export async function fetchGeo(): Promise<GeoOverview> {
  const res = await authFetch(GEO);
  if (!res.ok) throw new Error("Could not load geo rules.");
  const body = await res.json();
  return { ...body, blocked: Array.from(body.blocked ?? []) } as GeoOverview;
}

export async function setGeoRule(
  country: string,
  blocked: boolean,
  note?: string
): Promise<GeoRule> {
  const res = await authFetch(GEO, {
    method: "PUT",
    body: JSON.stringify({ country, blocked, note: note ?? null }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? "Could not save that rule.");
  return body as GeoRule;
}

export interface CountryBuckets {
  day: number;
  week: number;
  month: number;
  total: number;
}

export type StatsPeriod = "24h" | "7d" | "30d" | "all";

export interface RatedTitle {
  animeId: number;
  title: string;
  average: number;
  votes: number;
}

export interface CountryStats {
  country: string;
  blocked: boolean;
  signups: CountryBuckets;
  watchingNow: number;
  views: CountryBuckets;
  topTitles: { title: string; views: number }[];
  topRated: RatedTitle[];
  averageScore: number | null;
  period: StatsPeriod;
  refusedRequests: number;
  lastSignupAt: string | null;
  attributedUsers: number;
  unattributedUsers: number;
}

export async function fetchCountryStats(
  country: string,
  period: StatsPeriod = "all"
): Promise<CountryStats | null> {
  const res = await authFetch(`${GEO}/${country}/stats?period=${period}`);
  if (!res.ok) return null;
  return (await res.json()) as CountryStats;
}

export async function fetchGeoAudit(limit = 30): Promise<GeoAuditEntry[]> {
  const res = await authFetch(`${GEO}/audit?limit=${limit}`);
  if (!res.ok) return [];
  return (await res.json()) as GeoAuditEntry[];
}

/**
 * Country an admin is currently previewing as, stored per browser.
 *
 * The simulation is enforced server-side and only honoured for admins, so this
 * value cannot grant anyone access — at worst it refuses the admin's own
 * requests, which is exactly the point of a preview.
 */
export function readSimulation(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SIMULATE_KEY);
}

export function writeSimulation(country: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (country) window.localStorage.setItem(SIMULATE_KEY, country);
    else window.localStorage.removeItem(SIMULATE_KEY);
    window.dispatchEvent(new CustomEvent("anifire:geo-simulate"));
  } catch {
    /* storage disabled — preview simply stays off */
  }
}

/**
 * Subscription side of the preview store, for `useSyncExternalStore`: the value
 * lives in localStorage, so it must be read on the client only and re-read when
 * this tab (custom event) or another tab (`storage`) changes it.
 */
export function subscribeSimulation(onChange: () => void): () => void {
  window.addEventListener("anifire:geo-simulate", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("anifire:geo-simulate", onChange);
    window.removeEventListener("storage", onChange);
  };
}
