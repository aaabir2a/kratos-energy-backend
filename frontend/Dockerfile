# syntax=docker/dockerfile:1

# ─── build: vite production bundle ─────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Absolute backend origin baked into the bundle (Vite inlines VITE_* at build).
# Empty → relative /api/v1 (same-origin via the container's own /api proxy).
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ─── runner: static SPA served by nginx (+ /api proxy to backend) ──
FROM nginx:1.27-alpine AS runner
# our server block replaces the stock default
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
