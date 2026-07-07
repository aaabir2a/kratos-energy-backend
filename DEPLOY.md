# Deploying Kratos CRM with Docker (shared VPS)

Runs the backend (`api.kratos-energy.com`) and CRM frontend
(`crm.kratos-energy.com`) as two containers, alongside other projects on the
same Contabo VPS, **using the existing live Postgres** (no DB container).

## How it stays isolated from other projects
- No Postgres/Redis/MinIO containers — reuses what's already on the host.
- Container ports bind to **127.0.0.1 only** (`API_PORT`, `WEB_PORT`) — nothing
  listens on `:80`/`:443`, so your existing host nginx keeps owning them.
- The host nginx gets **two new vhost files** (api + crm) — no other site touched.
- Its own docker network `kratos-crm-net` and `kratos-crm-*` container names.

```
Internet
  ├── api.kratos-energy.com ─┐  (host nginx vhost)  → 127.0.0.1:4000 → [api container]
  └── crm.kratos-energy.com ─┘  (host nginx vhost)  → 127.0.0.1:8080 → [web container]
                                                                          │ /api → api:4000
[api container] ── host.docker.internal:5432 ──▶ live Postgres (on host)
                └─ MINIO_ENDPOINT:9000 ─────────▶ MinIO (public host)
```

## 1. Get the code
```bash
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/aaabir2a/kratos-energy-backend.git kratos
cd kratos
```

## 2. Configure
```bash
cp .env.example .env                       # API_PORT / WEB_PORT — change if 4000/8080 are taken
cp backend/.env.production.example backend/.env
nano backend/.env                          # fill secrets, DB host, MinIO
```
In `backend/.env`:
- `DATABASE_URL` → **port 5432**, password `@` encoded as `%40`. If Postgres runs
  on this VPS, keep host `host.docker.internal` (compose maps it to the host).
  Make sure Postgres accepts the docker subnet — see **Postgres access** below.
- `MINIO_ENDPOINT` → a **public** host/IP (image URLs go to the marketing site).
- Generate secrets: `openssl rand -hex 32` (JWT), `openssl rand -hex 24` (webhook).

## 3. Build & start
```bash
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1:4000/api/v1/health      # {"success":true,...}
curl -sI http://127.0.0.1:8080/                  # 200, serves the SPA
```
The live DB is already migrated/seeded — **don't** run migrate/seed. Only if the
schema changed in a new release:
```bash
docker compose --profile tools run --rm migrate           # prisma migrate deploy
# fresh DB only: docker compose --profile tools run --rm migrate npx tsx prisma/seed.ts
```

## 4. Postgres access from the container
The DB must accept connections from the docker bridge. On the host:
```bash
# postgresql.conf:  listen_addresses = '*'      (or include the docker0 IP)
# pg_hba.conf:      host  kratos-backend  kratos  172.16.0.0/12   scram-sha-256
sudo systemctl reload postgresql
```
(If the kratos user already connects from remote machines, it likely works as-is.)

## 5. Host nginx — two vhosts (does not touch other sites)
```bash
sudo cp deploy/nginx/api.kratos-energy.com.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/crm.kratos-energy.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/api.kratos-energy.com.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/crm.kratos-energy.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
> If a port differs from 4000/8080, edit the `proxy_pass` in these files to match `.env`.

## 6. DNS + TLS
Point A records `api.kratos-energy.com` and `crm.kratos-energy.com` at the VPS IP.
Once they resolve:
```bash
sudo certbot --nginx -d api.kratos-energy.com -d crm.kratos-energy.com
```
certbot rewrites the two vhosts to add HTTPS + redirect. Other sites unaffected.

## Verify
- `https://api.kratos-energy.com/api/v1/health` → ok
- `https://api.kratos-energy.com/api/v1/docs` → Swagger
- `https://crm.kratos-energy.com` → log in
- Marketing site calls `https://api.kratos-energy.com/api/v1/public/...`

## Redeploy a new version
```bash
cd ~/apps/kratos && git pull
docker compose up -d --build          # rebuilds changed images, recreates containers
# if the release added a migration:
docker compose --profile tools run --rm migrate
```

## Ops
```bash
docker compose logs -f api            # backend logs
docker compose logs -f web            # nginx access/error
docker compose restart api
docker compose down                   # stop (keeps the live DB, it's external)
```
