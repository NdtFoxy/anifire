# Anifire - Fullstack Anime Streaming Platform

## 🛠 Tech Stack

### Backend
- **Language:** Java 21 (LTS)
- **Framework:** Spring Boot 4.0.5
- **Database:** PostgreSQL
- **ORM:** Hibernate (Spring Data JPA)
- **Containerization:** OrbStack / Docker Compose
- **External Integration:** Jikan API v4

### Frontend
- **Framework:** Next.js
- **Styling:** Tailwind CSS
- **Language:** TypeScript

---

## 🚀 How to Run

**1. Start the Database (PostgreSQL):**
```bash
cd anime-backend/anime-backend
docker compose up -d
```

**2. Start the Backend (Java / Spring Boot):**
```bash
# While in the same anime-backend/anime-backend directory
./gradlew bootRun
```

**3. Start the Frontend (Next.js):**
```bash
cd ../../anime-streaming
npm install
npm run dev
```