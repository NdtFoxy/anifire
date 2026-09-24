# Anifire - Fullstack Anime Streaming Platform

Anifire is a Java/Spring Boot + Next.js anime streaming project. In the course
requirements, anime titles work as the product module.

## Tech Stack

- Backend: Java 21, Spring Boot 4, Spring Data JPA/Hibernate, PostgreSQL, JWT auth.
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS.
- Database: local PostgreSQL through Docker Compose.
- External API: Jikan API v4 for initial top-anime seeding.

## Modules

- Catalog: anime CRUD, categories (many-to-many), server-side pagination,
  search and filtering; soft deletes everywhere.
- Auth: JWT (RS256) login/register/refresh/logout, email verification,
  password reset, login lockout, breach check, OIDC social sign-in
  (Google/Microsoft/Apple), `ADMIN` / `USER` roles.
- Profile: avatars/banners (served from `/uploads/**`), bookmarks, friends,
  ratings, watch progress and watch events; friends activity feed.
- Notifications: hourly check of bookmarked titles for new episodes → in-app
  inbox (bell in the nav) and an email digest (opt-out in the bell panel).
- Watch parties: shared play/pause/seek/episode over server-sent events; invite
  by link (`/watch/<id>?ep=N&party=<code>`). Rooms are in memory, so the API runs
  as a single instance.
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
- Ops: startup safety checks and a security signal feed at `/admin`.

The first registered user becomes `ADMIN`, which gives the project a local
bootstrap path without hard-coded credentials.

## How To Run

Start PostgreSQL:

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
cd anime-backend/anime-backend && ./gradlew integrationTest  # Testcontainers Postgres, needs Docker
cd anime-streaming && npm run lint
cd anime-streaming && npm run build
cd anime-streaming && npm run test:e2e   # Playwright; starts backend + frontend itself
```

All of them run in CI (`.github/workflows/ci.yml`). `test` uses in-memory H2;
`integrationTest` applies the Flyway migrations to a real `postgres:16` and lets
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

### Docker deploy

```bash
cp .env.prod.example .env.prod   # fill it in
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
```

One public origin behind Caddy (automatic HTTPS for `ANIFIRE_DOMAIN`):
`/api/v1/*`, `/uploads/*`, `/.well-known/*` go to the API, everything else to
Next.js. Only Caddy publishes ports; Postgres, the API and the `ling` sidecar are
reachable only on the internal network. The API container is healthy when
`/actuator/health/liveness` answers (not exposed publicly). Uploads, the
database and the subtitle cache live in named volumes.
