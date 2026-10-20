# syntax=docker/dockerfile:1.7
# Multi-stage build. Targets: `web` (Caddy + built frontend, terminates HTTPS) and `api` (default; Node backend).
# BuildKit cache mounts keep npm downloads between builds so rebuilds are fast.

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build -w @ek/web

FROM node:26-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund --workspace @ek/api --workspace @ek/shared --include-workspace-root=false

# ---- frontend + HTTPS edge ----
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80 443

# ---- backend (default target) ----
FROM node:26-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# The API also serves index.html with per-page SEO tags, so it carries the same build of the frontend.
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node_modules/.bin/tsx", "apps/api/src/server.ts"]
