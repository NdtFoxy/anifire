import * as Sentry from "@sentry/nextjs";

// Browser error reporting; the DSN is public by design (it only allows sending
// events). Inlined at build time, so without NEXT_PUBLIC_SENTRY_DSN nothing loads.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}
