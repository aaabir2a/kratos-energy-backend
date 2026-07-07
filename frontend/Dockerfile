# syntax=docker/dockerfile:1

# ─── build: vite production bundle ─────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── runner: static SPA served by nginx (+ /api proxy to backend) ──
FROM nginx:1.27-alpine AS runner
# our server block replaces the stock default
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
