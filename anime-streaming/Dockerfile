# Next.js frontend as a standalone Node server.
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so they
# are build args; server-only secrets (TMDB, Jimaku, Ollama) are runtime env.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules node_modules
COPY . .
RUN test -n "$NEXT_PUBLIC_BACKEND_URL" || (echo "NEXT_PUBLIC_BACKEND_URL build arg is required" && exit 1) \
 && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN adduser -S -u 10001 next \
 && mkdir -p .cache && chown next .cache
COPY --from=build /app/public ./public
COPY --from=build --chown=next /app/.next/standalone ./
COPY --from=build --chown=next /app/.next/static ./.next/static
USER next
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/ > /dev/null || exit 1
CMD ["node", "server.js"]
