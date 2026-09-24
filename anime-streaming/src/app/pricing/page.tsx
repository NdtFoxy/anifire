import type { Metadata } from "next";
import PricingView from "./PricingView";

/**
 * Server shell. The page is public and its metadata is static, so the title and
 * description are rendered on the server; the plan catalogue itself is fetched
 * in the browser (see PricingView) because it varies with the signed-in user's
 * current plan.
 */
export const metadata: Metadata = {
  title: "Anifire — Ads-free plans",
  description:
    "Remove the sponsor breaks. Monthly, yearly and lifetime ads-free plans for Anifire, cancellable at any time.",
};

export default function PricingPage() {
  return <PricingView />;
}
