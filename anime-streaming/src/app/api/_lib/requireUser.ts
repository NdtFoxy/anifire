import { NextResponse } from "next/server";

/**
 * Gate for the AI proxy routes.
 *
 * These routes forward to a local Ollama (and jimaku) on the owner's machine,
 * so an unauthenticated caller spends the owner's GPU time and API key. Every
 * AI route therefore proves the session against the auth server and books the
 * work against the caller's daily quota before doing anything expensive.
 */

// Server-to-server: inside the container network the public origin may not
// resolve (or would hairpin through the proxy), so prefer the internal address.
const BACKEND =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8080";

export type QuotaKind = "REVIEW" | "TRANSLATE";

/** Largest number of units a single call may book, per the quota contract. */
const MAX_UNITS = 200;

/** Carries the HTTP status/body the browser should see for a refused call. */
export class AiGateError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "AiGateError";
    this.status = status;
    this.code = code;
  }
}

function unauthorized(): AiGateError {
  return new AiGateError(401, "unauthorized", "Sign in to use the AI features.");
}

/**
 * Verifies the caller's bearer token against the auth server and returns it so
 * the route can spend it on quota. The user identity is never taken from the
 * request body: only the token the auth server accepts counts.
 */
export async function requireUser(req: Request): Promise<{ token: string }> {
  const header = req.headers.get("authorization");
  if (!header) throw unauthorized();
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) throw unauthorized();
  const token = match[1];

  let res: Response;
  try {
    res = await fetch(`${BACKEND}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    // The auth server is the only thing that can authorise this call, so a
    // transport failure must deny rather than fall open.
    throw new AiGateError(503, "ai_unavailable", "Authentication is unavailable.");
  }
  if (!res.ok) throw unauthorized();
  return { token };
}

async function quotaMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message ?? body.error;
  } catch {
    return undefined;
  }
}

/**
 * Books `units` of the caller's daily AI allowance. Throws {@link AiGateError}
 * with 429 when the allowance is spent and 503 for anything else, so a quota
 * outage never silently hands out free GPU time.
 */
export async function consumeQuota(
  token: string,
  kind: QuotaKind,
  units: number
): Promise<void> {
  const amount = Math.max(1, Math.min(MAX_UNITS, Math.round(units) || 1));
  let res: Response;
  try {
    res = await fetch(`${BACKEND}/api/v1/ai/quota/consume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ kind, units: amount }),
      cache: "no-store",
    });
  } catch {
    throw new AiGateError(503, "ai_unavailable", "AI quota service is unavailable.");
  }
  if (res.ok) return;
  if (res.status === 429) {
    throw new AiGateError(
      429,
      "ai_quota_exceeded",
      (await quotaMessage(res)) ?? "Daily AI limit reached. Try again tomorrow."
    );
  }
  throw new AiGateError(503, "ai_unavailable", "AI quota service is unavailable.");
}

/** Maps a gate failure to the response the browser gets. */
export function aiGateResponse(err: unknown): NextResponse {
  const gate =
    err instanceof AiGateError
      ? err
      : new AiGateError(503, "ai_unavailable", "AI is unavailable.");
  return NextResponse.json(
    { error: gate.code, message: gate.message },
    { status: gate.status }
  );
}
