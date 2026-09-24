"use client";

import { authFetch } from "@/lib/auth-client";

/** Abuse signals and recent server errors, for the console's Signals section. */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

export interface SecuritySignal {
  severity: "high" | "medium" | "low";
  kind: string;
  title: string;
  subject: string;
  detail: string;
  userId: number | null;
  count: number;
  at: string;
}

export interface ServerError {
  at: string;
  method: string;
  path: string;
  type: string;
  message: string;
  userId: number | null;
}

export interface SecurityOverview {
  signals: SecuritySignal[];
  signalCount: number;
  errors: ServerError[];
  errorCount: number;
}

export async function fetchSecurity(): Promise<SecurityOverview> {
  const res = await authFetch(`${API_BASE}/api/v1/admin/security`);
  if (!res.ok) throw new Error("Could not load the signal feed.");
  return (await res.json()) as SecurityOverview;
}
