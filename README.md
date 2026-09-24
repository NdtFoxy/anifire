# Anifire - Fullstack Anime Streaming Platform

Anifire is a Java/Spring Boot + Next.js anime streaming project. In the course
requirements, anime titles work as the product module.

## Tech Stack

- Backend: Java 21, Spring Boot 4, Spring Data JPA/Hibernate, PostgreSQL, JWT auth.
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS.
- Database: local PostgreSQL through Docker Compose.
- External APIs: Jikan (MAL top list), Shikimori (Russian titles/synopses),
  AniList (artwork), all read server-side at import time.

## Modules

- Catalog: anime CRUD, categories (many-to-many), server-side pagination,
  search and filtering; soft deletes everywhere. Admin → Каталог imports MAL's
  top list and enriches it with Russian titles, synopses and genre names plus
  artwork, so browsers never call AniList for the catalogue (per-title AniList
  lookups go through the cached `/api/anilist` route).
- Home: «Продолжить просмотр» from server-side progress and «Рекомендуем вам»
  (genre affinity from ratings, bookmarks and history); «Похожие» on title pages.
- Auth: JWT (RS256) login/register/refresh/logout, email verification,
  password reset, login lockout, breach check, OIDC social sign-in
  (Google/Microsoft/Apple), `ADMIN` / `USER` roles.
- Profile: avatars/banners (local disk in dev, S3-compatible bucket in
  production, always at `/uploads/**`), bookmarks, friends, ratings, watch
  progress and watch events; friends activity feed.
- Notifications: hourly check of bookmarked titles for new episodes → in-app
  inbox (bell in the nav) and an email digest (opt-out in the bell panel).
- Watch parties: shared play/pause/seek/episode over server-sent events; invite
  by link (`/watch/<id>?ep=N&party=<code>`). Rooms live in Redis, so any number
  of API instances can serve one party.
- Mail: SMTP (Russian HTML + text templates). In dev every message lands in
  Mailpit (started by compose): http://localhost:8025.
- PWA: installable (manifest + icons), service worker with an offline page.
- Billing: subscription plans, checkout intents, payment events; `dev` provider
  locally, YooKassa in production.
- Ads: campaigns, creatives, decisions and event tracking with an admin UI.
- Geo: country rules from trusted-proxy headers, audit log, admin stats.
- Language learning: study packs, vocabulary and spaced-repetition reviews,
  backed by the `ling/` morphology sidecar.
- AI: per-account daily quota for reviews and subtitle translation (Ollama).
- Ops: startup safety checks, a security signal feed at `/admin`, error
  reporting to Sentry/GlitchTip when `SENTRY_DSN` is set (emails masked), and
  nightly verified database backups.

The first registered user becomes `ADMIN`, which gives the project a local
bootstrap path without hard-coded credentials.

## How To Run

Start PostgreSQL, Redis and Mailpit:

```bash
cd anime-backend/anime-backend
docker compose up -d
```

Start the backend:

```bash
cd anime-backend/anime-backend
./gradlew bootRun
```

Swagger UI:

```text
http://localhost:8080/swagger-ui/index.html
```

Start the linguistics sidecar (optional — only needed to build study packs):

```bash
cd ling
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8090
```

Start the frontend:

```bash
cd anime-streaming
cp .env.example .env.local   # fill in TMDB_API_KEY / JIMAKU_API_KEY
npm install
npm run dev
```

Frontend URLs:

- App: `http://localhost:3000`
- Catalog: `http://localhost:3000/stream`
- Admin panel: `http://localhost:3000/admin`

## Checks

```bash
cd anime-backend/anime-backend && ./gradlew test             # H2, no Docker
cd anime-backend/anime-backend && ./gradlew integrationTest  # Testcontainers Postgres + Redis, needs Docker
cd anime-streaming && npm run lint
cd anime-streaming && npm run build
cd anime-streaming && npm run test:e2e   # Playwright; starts backend + frontend itself
```

All of them run in CI (`.github/workflows/ci.yml`). `test` uses in-memory H2;
`integrationTest` runs the watch-party store against a real Redis with two API
"nodes", and applies the Flyway migrations to a real `postgres:16` and lets
Hibernate validate the entities against them. `test:e2e` reuses a backend or
frontend that is already running locally — stop yours first, because the test
needs the backend started with `auto-verify-email=true`.

## Production

Run the backend with `SPRING_PROFILES_ACTIVE=prod`
(`src/main/resources/application-prod.properties`). The startup safety check
refuses to boot and lists every missing value until these are set:

| Variable | Purpose |
| --- | --- |
| `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` | Postgres connection |
| `ANIFIRE_SECURITY_PEPPER` | base64 password pepper |
| `ANIFIRE_JWT_ISSUER` | public issuer URL (not `*.local`) |
| `ANIFIRE_JWT_JWK_SET` | base64 of the signing JWK JSON |
| `ANIFIRE_CORS_ALLOWED_ORIGINS` | comma-separated frontend origins |
| `ANIFIRE_APP_FRONTEND_URL` | base URL for email links |
| `ANIFIRE_BILLING_SHOP_ID` / `_SECRET_KEY` / `_RETURN_URL` | YooKassa |
| `SPRING_MAIL_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD`, `ANIFIRE_MAIL_FROM` | SMTP relay |
| `MINIO_ROOT_USER` / `_PASSWORD` | object storage for uploads (and the default backup target) |
| `BACKUP_S3_*` (optional) | off-site bucket for nightly database dumps |
| `SENTRY_DSN` (optional) | error reporting for API and site |

### Docker deploy

```bash
cp .env.prod.example .env.prod   # fill it in
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
```

One public origin behind Caddy (automatic HTTPS for `ANIFIRE_DOMAIN`):
`/api/v1/*` and `/.well-known/*` go to the API, `/uploads/<key>` straight to the
MinIO `uploads` bucket (single objects only, no listing), everything else to
Next.js. Only Caddy publishes ports; Postgres, Redis, MinIO, the API and the
`ling` sidecar are reachable only on the internal network. The API container is
healthy when `/actuator/health/liveness` answers (not exposed publicly).

After the first deploy the catalogue is empty: sign up (the first account is
`ADMIN`), open Admin → Каталог and run «Импортировать топ».

### Backups

The `backup` service runs `pg_dump` nightly, checks that the dump is readable,
keeps 14 days in the `backups` volume and copies each dump to `BACKUP_S3_*`
(defaults to the local MinIO — set an off-site bucket for real protection).

```bash
# take one now
docker compose -f compose.prod.yaml --env-file .env.prod exec backup backup.sh once
# restore (stop the backend first)
docker compose -f compose.prod.yaml --env-file .env.prod stop backend
docker compose -f compose.prod.yaml --env-file .env.prod exec backup restore.sh /backups/anifire-<stamp>.dump
docker compose -f compose.prod.yaml --env-file .env.prod start backend
```
