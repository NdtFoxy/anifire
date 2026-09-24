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
  ratings, watch progress and watch events.
- Player: HLS playback, subtitles, resume, ad overlay.
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
cd anime-backend/anime-backend && ./gradlew test
cd anime-streaming && npm run lint
cd anime-streaming && npm run build
```

The same three checks run in CI (`.github/workflows/ci.yml`); backend tests use
in-memory H2, so no database is required for them.
