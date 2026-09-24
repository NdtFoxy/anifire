import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting to Sentry (or a compatible collector such as
 * GlitchTip), active only when SENTRY_DSN is set at runtime.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
  });
}

/** Errors thrown while rendering pages or running route handlers. */
export const onRequestError = Sentry.captureRequestError;
