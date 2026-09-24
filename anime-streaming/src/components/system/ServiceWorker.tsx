"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds only: in `next dev` a service worker
 * would serve stale chunks across hot reloads.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
