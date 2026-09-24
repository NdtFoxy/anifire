"use client";

import { authFetch } from "@/lib/auth-client";

/**
 * Paid subscription client.
 *
 * Nothing here throws. Every call resolves to data or to an explicit absence
 * (`null`, `[]`, or an `ok: false` outcome) because the surfaces that consume
 * it — the pricing grid and the profile's subscription tab — must always render
 * a state rather than unmount into an error boundary. Same contract as
 * lib/study.ts.
 *
 * Prices are never computed or stored on the client: the plan catalogue is the
 * server's answer, formatted here and nowhere else.
 */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const BASE = `${API_BASE}/api/v1`;

export type BillingPlanCode = "MONTHLY" | "YEARLY" | "LIFETIME";

export interface BillingPlan {
  plan: BillingPlanCode;
  title: string;
  priceRub: number;
  periodLabel: string;
  perks: string[];
}

export type SubscriptionStatus =
  | "NONE"
  | "PENDING"
  | "ACTIVE"
  | "CANCELED"
  | "EXPIRED";

export interface Subscription {
  status: SubscriptionStatus;
  plan: BillingPlanCode | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Server-resolved entitlement. The player asks the server, never this flag. */
  adsFree: boolean;
}

/**
 * A checkout attempt either yields a payment page to send the browser to, or a
 * reason the user can act on. A bare `null` would collapse "you are already
 * subscribed", "too many attempts" and "the provider is down" into one useless
 * spinner-off.
 */
export type CheckoutOutcome =
  | { ok: true; paymentId: string; confirmationUrl: string }
  | { ok: false; code: string; message: string };

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

/** Public catalogue — readable before sign-in, so no token is involved. */
export async function fetchPlans(): Promise<BillingPlan[]> {
  try {
    const res = await fetch(`${BASE}/billing/plans`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    return (await res.json()) as BillingPlan[];
  } catch {
    return [];
  }
}

export async function startCheckout(
  plan: BillingPlanCode,
  returnUrl: string
): Promise<CheckoutOutcome> {
  try {
    const res = await authFetch(`${BASE}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ plan, returnUrl }),
    });
    if (!res.ok) {
      return failure(
        res,
        res.status === 429
          ? "Слишком много попыток оплаты. Подождите немного и попробуйте снова."
          : "Не удалось открыть страницу оплаты. Попробуйте ещё раз."
      );
    }
    const data = (await res.json()) as {
      paymentId?: string;
      confirmationUrl?: string;
    };
    if (!data.confirmationUrl) {
      return {
        ok: false,
        code: "no_confirmation_url",
        message: "Платёжный сервис не вернул страницу оплаты.",
      };
    }
    return {
      ok: true,
      paymentId: data.paymentId ?? "",
      confirmationUrl: data.confirmationUrl,
    };
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Ошибка сети. Проверьте подключение и попробуйте снова.",
    };
  }
}

/** True once the server accepted the cancel; the plan runs to the period end. */
export async function cancelSubscription(): Promise<boolean> {
  try {
    const res = await authFetch(`${BASE}/billing/cancel`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSubscription(): Promise<Subscription | null> {
  try {
    const res = await authFetch(`${BASE}/me/subscription`);
    if (!res.ok) return null;
    return (await res.json()) as Subscription;
  } catch {
    return null;
  }
}

const RUB = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function formatRub(priceRub: number): string {
  return RUB.format(priceRub);
}
