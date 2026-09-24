"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  Minus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  cancelSubscription,
  fetchSubscription,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/billing";
import styles from "@/app/profile/profile.module.css";
import { fullDate } from "./format";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { useResource } from "./useResource";

/**
 * Subscription state, owned by the server.
 *
 * Two things make this tab more than a read-out:
 *
 * - **Cancelling** is a two-press action. The server keeps the plan alive until
 *   the period already paid for ends, and the confirm step says so, because the
 *   word "cancel" reads as "lose access now" to most people.
 * - **Returning from the payment page** is a race. The provider redirects the
 *   browser back immediately, but the entitlement arrives on a separate webhook
 *   a few seconds later, so the tab polls a bounded number of times and then
 *   admits it does not know yet rather than spinning forever.
 */

const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

const STATUS: Record<
  SubscriptionStatus,
  { label: string; pill: "on" | "warn" | "off" }
> = {
  NONE: { label: "Free", pill: "off" },
  PENDING: { label: "Pending", pill: "warn" },
  ACTIVE: { label: "Active", pill: "on" },
  CANCELED: { label: "Canceled", pill: "warn" },
  EXPIRED: { label: "Expired", pill: "off" },
};

/**
 * The plan code is the label: "MONTHLY" → "Monthly". Deriving it means adding a
 * plan on the server needs no frontend release, and it can never disagree with
 * what the user was actually charged for.
 */
function planLabel(plan: string): string {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

/** How the current period reads, given status and the cancel flag. */
function periodLine(sub: Subscription): string {
  const date = sub.currentPeriodEnd;
  if (sub.status === "EXPIRED") return `Expired on ${fullDate(date)}`;
  if (!date) return sub.status === "ACTIVE" ? "Never expires" : "—";
  if (sub.cancelAtPeriodEnd || sub.status === "CANCELED") {
    return `Access ends on ${fullDate(date)}`;
  }
  if (sub.status === "PENDING") return `Starts once the payment clears`;
  return `Renews on ${fullDate(date)}`;
}

export default function SubscriptionTab() {
  const { refreshUser } = useAuth();
  const params = useSearchParams();

  const {
    data: sub,
    loading,
    error,
    reload,
    set,
  } = useResource<Subscription>(async () => {
    // fetchSubscription resolves to null instead of throwing; turn that back
    // into a failure so the error state and its retry actually appear.
    const value = await fetchSubscription();
    if (!value) throw new Error("We could not load your subscription.");
    return value;
  });

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const returning = params.get("billing") === "return";
  // The poll only ever *ends* asynchronously, so only its end is stored: while
  // we are returning from checkout and nothing has landed yet, "checking" is
  // simply what the state means, and deriving it during render keeps the
  // effect body free of a synchronous setState.
  const [outcome, setOutcome] = useState<"confirmed" | "unknown" | null>(null);
  const poll: "idle" | "checking" | "confirmed" | "unknown" = !returning
    ? "idle"
    : (outcome ?? "checking");

  // Runs once per mount: `returning`, `refreshUser` and `set` are all stable, so
  // the poll is never restarted by a re-render. A ref guard would be worse than
  // useless here — under React's development double-mount it would let the
  // first (immediately cancelled) pass claim the flag and the surviving mount
  // would then skip the poll entirely.
  useEffect(() => {
    if (!returning) return;

    let cancelled = false;

    void (async () => {
      // The entitlement travels in the access token's claim, minted at refresh
      // time — so ask for a fresh one before trusting anything on screen.
      await refreshUser();
      if (cancelled) return;

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        const value = await fetchSubscription();
        if (cancelled) return;
        if (value) {
          set(value);
          if (value.status === "ACTIVE") {
            // The webhook landed after our first refresh; re-mint the token so
            // playback stops serving ads without asking for a reload.
            await refreshUser();
            if (!cancelled) setOutcome("confirmed");
            return;
          }
        }
        if (attempt < POLL_ATTEMPTS - 1) {
          const wait = Promise.withResolvers<void>();
          setTimeout(wait.resolve, POLL_INTERVAL_MS);
          await wait.promise;
          if (cancelled) return;
        }
      }
      setOutcome("unknown");
    })();

    return () => {
      cancelled = true;
    };
  }, [returning, refreshUser, set]);

  async function confirmCancel() {
    setCancelError(null);
    setCancelling(true);
    const ok = await cancelSubscription();
    setCancelling(false);
    if (!ok) {
      setCancelError(
        "We could not cancel the plan just now. Nothing changed — please try again."
      );
      return;
    }
    setConfirming(false);
    // The plan stays active until the period ends, but the claim that decides
    // ad serving is re-minted here so the two never disagree.
    await refreshUser();
    reload();
  }

  const returnBanner =
    poll === "checking" ? (
      <aside className={styles.checkCard} role="status">
        <Loader2 size={18} className={`${styles.checkIcon} ${styles.spin}`} />
        <div>
          <h3>Payment received — checking…</h3>
          <p>
            The provider confirms the charge to us separately, which usually
            takes a few seconds.
          </p>
        </div>
      </aside>
    ) : poll === "confirmed" ? (
      <aside className={styles.checkCard} role="status">
        <Check size={18} className={styles.checkIcon} />
        <div>
          <h3>Your plan is active.</h3>
          <p>Ads are off everywhere you are signed in.</p>
        </div>
      </aside>
    ) : poll === "unknown" ? (
      <aside className={styles.checkCard} role="status">
        <Clock size={18} className={styles.checkIcon} />
        <div>
          <h3>Payment received, confirmation still pending.</h3>
          <p>
            We stopped checking after {POLL_ATTEMPTS} attempts. The plan
            activates as soon as the provider notifies us — usually within a few
            minutes. Nothing is lost; reload this tab to look again.
          </p>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={reload}
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={15} className={styles.spin} />
            ) : (
              <Clock size={15} />
            )}
            Check again
          </button>
        </div>
      </aside>
    ) : null;

  if (loading && !sub) {
    return (
      <div className={styles.subscription}>
        {returnBanner}
        <Skeleton lines={4} height={22} />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className={styles.subscription}>
        {returnBanner}
        <ErrorState
          message={error ?? "We could not load your subscription."}
          onRetry={reload}
          retrying={loading}
        />
      </div>
    );
  }

  if (sub.status === "NONE") {
    return (
      <div className={styles.subscription}>
        {returnBanner}
        <EmptyState icon={<Sparkles size={22} />} title="You are on the free plan">
          <p>
            The whole catalogue, your list and your progress stay free. A paid
            plan removes the sponsor breaks before every episode.
          </p>
          <Link href="/pricing" className={styles.primaryLink} data-tap>
            Go ads-free
          </Link>
        </EmptyState>

        <aside className={styles.noteCard}>
          <ShieldCheck size={17} className={styles.noteIcon} />
          <p>
            Your entitlement comes straight from the server on every load —
            nothing here is stored in the browser.
          </p>
        </aside>
      </div>
    );
  }

  const status = STATUS[sub.status];
  const lapsing = sub.cancelAtPeriodEnd || sub.status === "CANCELED";

  return (
    <div className={styles.subscription}>
      {returnBanner}

      <section
        className={`${styles.planCard} ${sub.adsFree ? styles.planActive : ""}`}
        data-rise
      >
        <div className={styles.planHead}>
          <span className={styles.planIcon}>
            {sub.adsFree ? <Sparkles size={20} /> : <Minus size={20} />}
          </span>
          <div>
            <h2 className={styles.planName}>
              {sub.plan ? `${planLabel(sub.plan)} · Ads-free` : "Ads-free"}
            </h2>
            <p className={styles.planState}>{periodLine(sub)}</p>
          </div>
          <span
            className={`${styles.planPill} ${
              status.pill === "on"
                ? styles.planPillOn
                : status.pill === "warn"
                  ? styles.planPillWarn
                  : ""
            }`}
          >
            {status.label}
          </span>
        </div>

        <dl className={styles.planMeta}>
          <div>
            <dt className={styles.planMetaKey}>Plan</dt>
            <dd className={styles.planMetaVal}>
              {sub.plan ? planLabel(sub.plan) : "—"}
            </dd>
          </div>
          <div>
            <dt className={styles.planMetaKey}>
              {lapsing ? "Access until" : "Current period"}
            </dt>
            <dd className={styles.planMetaVal}>
              {sub.currentPeriodEnd ? fullDate(sub.currentPeriodEnd) : "—"}
            </dd>
          </div>
          <div>
            <dt className={styles.planMetaKey}>Ads</dt>
            <dd className={styles.planMetaVal}>
              {sub.adsFree ? "Removed" : "Shown"}
            </dd>
          </div>
        </dl>

        <ul className={styles.benefits}>
          <li className={sub.adsFree ? styles.benefitOn : styles.benefitOff}>
            {sub.adsFree ? <Check size={15} /> : <Minus size={15} />}
            Ad-free playback
            <span className={styles.benefitNote}>
              Enforced server-side — the backend decides per request, the player
              only reflects it.
            </span>
          </li>
          <li className={sub.adsFree ? styles.benefitOn : styles.benefitOff}>
            {sub.adsFree ? <Check size={15} /> : <Minus size={15} />}
            Every device you sign in on
            <span className={styles.benefitNote}>
              The entitlement lives on the account, not on this browser.
            </span>
          </li>
          <li className={styles.benefitOn}>
            <Check size={15} />
            Full catalog, bookmarks and watch history
            <span className={styles.benefitNote}>Included on every plan.</span>
          </li>
        </ul>

        {sub.status === "ACTIVE" && !lapsing ? (
          confirming ? (
            <div className={styles.confirmBox}>
              <p className={styles.confirmText}>
                Cancel the plan? You keep ads-free access
                {sub.currentPeriodEnd
                  ? ` until ${fullDate(sub.currentPeriodEnd)}`
                  : ""}
                , and you will not be charged again.
              </p>
              <div className={styles.confirmRow}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => setConfirming(false)}
                  disabled={cancelling}
                >
                  Keep my plan
                </button>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => void confirmCancel()}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <Loader2 size={15} className={styles.spin} />
                  ) : null}
                  Yes, cancel
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.subActions}>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => setConfirming(true)}
              >
                Cancel subscription
              </button>
              <Link href="/pricing" className={styles.primaryLink} data-tap>
                See all plans
              </Link>
            </div>
          )
        ) : (
          <div className={styles.subActions}>
            <Link href="/pricing" className={styles.primaryLink} data-tap>
              {sub.adsFree ? "See all plans" : "Go ads-free"}
            </Link>
          </div>
        )}

        {cancelError ? (
          <p className={styles.inlineError} role="alert">
            <AlertTriangle size={15} />
            {cancelError}
          </p>
        ) : null}
      </section>

      {lapsing ? (
        <aside className={styles.noteCard} data-rise>
          <Clock size={17} className={styles.noteIcon} />
          <p>
            Cancelled. Ads-free access stays on
            {sub.currentPeriodEnd
              ? ` until ${fullDate(sub.currentPeriodEnd)}`
              : " until the end of the paid period"}
            , then the plan lapses. There are no further charges.
          </p>
        </aside>
      ) : null}

      {sub.status === "PENDING" ? (
        <aside className={styles.noteCard} data-rise>
          <Clock size={17} className={styles.noteIcon} />
          <p>
            The payment has not been confirmed yet. Nothing else is needed from
            you — the plan switches on by itself once the provider reports the
            charge.
          </p>
        </aside>
      ) : null}

      <aside className={styles.noteCard} data-rise>
        <ShieldCheck size={17} className={styles.noteIcon} />
        <p>
          Your entitlement comes straight from the server on every load —
          nothing here is stored in the browser.
        </p>
      </aside>
    </div>
  );
}
