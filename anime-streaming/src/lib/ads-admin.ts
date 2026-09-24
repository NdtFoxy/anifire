"use client";

import { authFetch } from "@/lib/auth-client";

/**
 * Advertising console client: campaigns, creatives and delivery statistics.
 *
 * Nothing here throws. Reads resolve to data or to an explicit absence (`null`,
 * `[]`) and writes resolve to an outcome, because the console must always render
 * a state — an operator who cannot see the campaign list also cannot pause the
 * campaign that is misbehaving. Same contract as lib/billing.ts.
 *
 * Every endpoint sits under `/api/v1/admin/ads`, which SecurityConfig restricts
 * to ROLE_ADMIN; the client-side admin check only decides what to render.
 *
 * Flight timestamps travel as full ISO instants with an offset (`…Z`) because
 * the columns behind them are timestamptz — a bare local date-time would be
 * ambiguous the moment the operator and the server disagree about the zone.
 */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const ADS = `${API_BASE}/api/v1/admin/ads`;

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export interface AdCampaign {
  id: number;
  name: string;
  advertiser: string;
  /** ИНН of the advertiser: 10 digits for a legal entity, 12 for a sole trader. */
  advertiserInn: string;
  status: CampaignStatus;
  /** null on either side means "no bound". */
  startsAt: string | null;
  endsAt: string | null;
  dailyImpressionCap: number;
  priority: number;
  createdAt: string | null;
  creativeCount: number;
}

export interface CampaignInput {
  name: string;
  advertiser: string;
  advertiserInn: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  dailyImpressionCap: number;
  priority: number;
}

export interface AdCreative {
  id: number;
  campaignId: number;
  src: string;
  durationSec: number;
  /** null = unskippable. */
  skipAfterSec: number | null;
  clickUrl: string | null;
  /** ОРД/ЕРИР marking token. Absent means the creative may not lawfully air. */
  ordToken: string | null;
  legalDisclaimer: string | null;
  ageRating: number | null;
  active: boolean;
  createdAt: string | null;
}

export interface CreativeInput {
  src: string;
  durationSec: number;
  skipAfterSec: number | null;
  clickUrl: string | null;
  ordToken: string | null;
  legalDisclaimer: string | null;
  ageRating: number | null;
  active: boolean;
}

export type StatsPeriod = "24h" | "7d" | "30d";

export interface AdStats {
  impressions: number;
  completes: number;
  skips: number;
  clicks: number;
  /** Already a percentage, two decimals: 2.34 means 2.34%. Zero, never null. */
  ctr: number;
  completionRate: number;
  byCampaign: {
    campaignId: number;
    name: string;
    impressions: number;
    completes: number;
    skips: number;
    clicks: number;
  }[];
  daily: { date: string; impressions: number; clicks: number }[];
  /**
   * Why the fill rate is what it is. An unmarked or inactive creative is simply
   * never selected, so a campaign can look healthy while delivering nothing —
   * this makes that cause visible instead of leaving it to be guessed.
   */
  blocked: { creativesWithoutOrdToken: number; inactiveCreatives: number };
}

/**
 * A write either landed or it did not. The saved row comes back in the response,
 * but the console refetches the list anyway — one source of truth beats two —
 * so the outcome only has to say whether to close the form and what to tell the
 * operator when it stays open.
 */
export type AdsOutcome = { ok: true } | { ok: false; code: string; message: string };

/** `{ error, message }` is the shape GlobalExceptionHandler emits. */
async function failure(res: Response, fallback: string): Promise<{
  ok: false;
  code: string;
  message: string;
}> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  return {
    ok: false,
    code: body.error ?? "error",
    message: body.message || fallback,
  };
}

async function write(url: string, method: string, body?: unknown): Promise<AdsOutcome> {
  try {
    const res = await authFetch(url, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) return failure(res, "The server refused that change.");
    return { ok: true };
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Network error. Check your connection and try again.",
    };
  }
}

export async function fetchCampaigns(): Promise<AdCampaign[]> {
  try {
    const res = await authFetch(`${ADS}/campaigns`);
    if (!res.ok) return [];
    return (await res.json()) as AdCampaign[];
  } catch {
    return [];
  }
}

export function createCampaign(input: CampaignInput): Promise<AdsOutcome> {
  return write(`${ADS}/campaigns`, "POST", input);
}

export function updateCampaign(id: number, input: CampaignInput): Promise<AdsOutcome> {
  return write(`${ADS}/campaigns/${id}`, "PUT", input);
}

/**
 * DELETE archives rather than erases: impressions already reported to the
 * register must keep the campaign they were bought under.
 */
export function archiveCampaign(id: number): Promise<AdsOutcome> {
  return write(`${ADS}/campaigns/${id}`, "DELETE");
}

export async function fetchCreatives(campaignId: number): Promise<AdCreative[]> {
  try {
    const res = await authFetch(`${ADS}/campaigns/${campaignId}/creatives`);
    if (!res.ok) return [];
    return (await res.json()) as AdCreative[];
  } catch {
    return [];
  }
}

export function createCreative(campaignId: number, input: CreativeInput): Promise<AdsOutcome> {
  return write(`${ADS}/campaigns/${campaignId}/creatives`, "POST", input);
}

export function updateCreative(id: number, input: CreativeInput): Promise<AdsOutcome> {
  return write(`${ADS}/creatives/${id}`, "PUT", input);
}

export function deleteCreative(id: number): Promise<AdsOutcome> {
  return write(`${ADS}/creatives/${id}`, "DELETE");
}

export async function fetchAdStats(period: StatsPeriod): Promise<AdStats | null> {
  try {
    const res = await authFetch(`${ADS}/stats?period=${period}`);
    if (!res.ok) return null;
    return (await res.json()) as AdStats;
  } catch {
    return null;
  }
}
