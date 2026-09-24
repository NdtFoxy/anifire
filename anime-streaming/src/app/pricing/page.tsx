import type { Metadata } from "next";
import PricingView from "./PricingView";

/**
 * Server shell. The page is public and its metadata is static, so the title and
 * description are rendered on the server; the plan catalogue itself is fetched
 * in the browser (see PricingView) because it varies with the signed-in user's
 * current plan.
 */
export const metadata: Metadata = {
  title: "Anifire — Тарифы без рекламы",
  description:
    "Смотрите без рекламных пауз. Тарифы Anifire без рекламы на месяц, год или навсегда — отменить можно в любой момент.",
};

export default function PricingPage() {
  return <PricingView />;
}
