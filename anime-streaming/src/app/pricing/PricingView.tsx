"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import StreamNav from "@/components/stream/StreamNav";
import StreamFooter from "@/components/stream/StreamFooter";
import { useAuth } from "@/components/auth/AuthProvider";
import { useReveal } from "@/lib/useReveal";
import {
  fetchPlans,
  formatRub,
  startCheckout,
  type BillingPlan,
  type BillingPlanCode,
} from "@/lib/billing";
import styles from "./pricing.module.css";

/**
 * Plan catalogue. Titles, prices, period labels and perks are the server's
 * answer — this file renders whatever /billing/plans returns and would show an
 * empty state rather than invent a price, because a wrong number here is a
 * promise the checkout cannot keep.
 *
 * Anonymous visitors are not sent into a checkout they cannot complete: the
 * button becomes a sign-in hop that returns here.
 */

/** Where the payment provider sends the browser back to. */
const RETURN_PATH = "/profile?tab=subscription&billing=return";

export default function PricingView() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);

  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<BillingPlanCode | null>(null);
  const [checkoutError, setCheckoutError] = useState<{
    plan: BillingPlanCode;
    message: string;
  } | null>(null);

  // A promise chain rather than async/await: every state update has to land in
  // a callback, because a setState the loader runs *before* its first await is
  // a synchronous setState inside the effect below.
  const load = useCallback(
    () =>
      fetchPlans().then((list) => {
        // fetchPlans swallows failures into []; an empty catalogue and a dead
        // endpoint are the same thing for a visitor who wants to pay.
        setFailed(!list.length);
        setPlans(list.length ? list : null);
      }),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The reset back to the skeleton belongs to the click, not to the loader:
  // on the first load the state already starts out empty.
  function retry() {
    setFailed(false);
    setPlans(null);
    void load();
  }

  useReveal(pageRef, [plans?.length ?? 0, failed]);

  async function buy(plan: BillingPlanCode) {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setCheckoutError(null);
    setBusy(plan);
    const outcome = await startCheckout(
      plan,
      `${window.location.origin}${RETURN_PATH}`
    );
    if (!outcome.ok) {
      setCheckoutError({ plan, message: outcome.message });
      setBusy(null);
      return;
    }
    // Leaving for the provider — keep the button busy so a second press during
    // the navigation cannot open a second payment.
    // assign() rather than assigning location.href: the compiler treats that
    // write as mutating a value it tracks, and this is a navigation either way.
    window.location.assign(outcome.confirmationUrl);
  }

  // The "what you get" list is the union of what the plans actually promise, so
  // it can never drift from the catalogue the server serves.
  const included = plans
    ? Array.from(new Set(plans.flatMap((p) => p.perks)))
    : [];

  return (
    <div className={styles.page} ref={pageRef}>
      <StreamNav />

      <header className={`${styles.shell} ${styles.head}`}>
        <span className={styles.eyebrow}>
          <Sparkles size={14} /> Ads-free
        </span>
        <h1 className={styles.title}>Watch without the interruptions.</h1>
        <p className={styles.lead}>
          The catalogue, your list and your progress stay free. A plan removes
          the sponsor breaks and keeps the servers running.
        </p>
      </header>

      <main id="main" className={styles.shell}>
        {plans === null && !failed ? (
          <div className={styles.skeletonGrid} aria-busy="true" aria-label="Loading plans">
            {[0, 1, 2].map((i) => (
              <span key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ) : failed || !plans ? (
          <div className={styles.failure} role="alert">
            <AlertTriangle size={22} className={styles.failureIcon} />
            <p>
              We could not load the plans right now, so there is nothing to
              quote you. Nothing was charged.
            </p>
            <button
              type="button"
              className={styles.retry}
              onClick={retry}
              data-tap
            >
              <RotateCcw size={16} /> Try again
            </button>
          </div>
        ) : (
          <div className={styles.grid} data-reveal>
            {plans.map((plan) => {
              const current = user?.adsFree === true && user.plan === plan.plan;
              const pending = busy === plan.plan;
              return (
                <article
                  key={plan.plan}
                  className={`${styles.card} ${current ? styles.cardCurrent : ""}`}
                  data-reveal-child
                >
                  <div className={styles.cardHead}>
                    <h2 className={styles.planTitle}>{plan.title}</h2>
                    {current ? (
                      <span className={styles.currentPill}>Current</span>
                    ) : null}
                  </div>

                  <p className={styles.priceRow}>
                    <span className={styles.price}>
                      {formatRub(plan.priceRub)}
                    </span>
                    <span className={styles.period}>{plan.periodLabel}</span>
                  </p>

                  <ul className={styles.perks}>
                    {plan.perks.map((perk) => (
                      <li key={perk}>
                        <Check size={15} />
                        {perk}
                      </li>
                    ))}
                  </ul>

                  {current ? (
                    <Link
                      href="/profile?tab=subscription"
                      className={styles.buy}
                      data-tap
                    >
                      Manage plan
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={styles.buy}
                      onClick={() => void buy(plan.plan)}
                      disabled={pending || authLoading}
                      data-tap
                    >
                      {pending ? (
                        <>
                          <Loader2 size={16} className={styles.spin} />
                          Opening payment…
                        </>
                      ) : user ? (
                        `Choose ${plan.title}`
                      ) : (
                        "Sign in to continue"
                      )}
                    </button>
                  )}

                  {checkoutError?.plan === plan.plan ? (
                    <p className={styles.cardError} role="alert">
                      <AlertTriangle size={14} />
                      {checkoutError.message}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {included.length ? (
          <section className={styles.included} data-reveal>
            <h2 className={styles.includedHead}>What you get</h2>
            <p className={styles.includedNote}>
              Every plan carries the same entitlement — only the billing period
              differs. Access is resolved on the server on each request, so it
              works on every device you sign in on.
            </p>
            <ul className={styles.includedList}>
              {included.map((perk) => (
                <li key={perk} data-reveal-child>
                  <Check size={16} />
                  {perk}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className={styles.foot}>
          Payment is handled by the provider on their own page; card details
          never reach Anifire. You can cancel at any time from{" "}
          <Link href="/profile?tab=subscription" className={styles.footLink}>
            your subscription settings
          </Link>{" "}
          and keep access until the period you paid for ends.
        </p>
      </main>

      <StreamFooter />
    </div>
  );
}
