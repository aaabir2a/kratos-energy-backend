# Kratos Sustainability CRM — project context

Lead-management CRM for Kratos Energy (Australian solar). Core loop: capture leads (website / landing pages / social / chatbot) → attribute source → auto-assign (round-robin) → convert to deal → close won/lost. Blueprint: `architecture_design.md` (implementation-status section at top). Paused expansion plan: `hubspot_parity_plan.md` (decisions §5 pending).

## Status

Phases 1–6 built + verified: auth/RBAC(4 roles: admin/manager/marketing/sales), leads+pipeline+round-robin, source attribution (first/last touch, UTM/gclid/fbclid), deals (convert/close, snapshot-priced items), landing pages + dynamic form engine (versioned `fields_schema`, server-validated), catalog (PDF schema: products/packages/package_products). Remaining: P7 notifications, P8 analytics, P9 hardening.

**Chatbot platform integration live** (guide: `D:\Kratos-office\chatbot\CRM_DEVELOPER_GUIDE.md`, platform api.ambrosianuk.com, X-CRM-Key): HMAC webhook receiver `/api/v1/chatbot/webhook`, auto lead ingestion w/ dedupe+enrichment, transcript mirror (chat_conversations/chat_messages), Chat Inbox UI at `/chat` (replay, live takeover/reply/release, 4s polling), `POST /chatbot/sync?full=true` backfill, lead status write-back. Real keys in `backend/.env` (never commit).

## Architecture

- `backend/` Node22+TS+Express+Prisma. Modules under `src/modules/*` (routes→controller→service→repository, Zod at edges). RBAC catalog: `src/shared/constants/rbac.ts` (seed re-provisions roles/perms). Swagger from Zod: `/api/v1/docs` (`src/core/openapi/registry.ts` — add paths per feature).
- `frontend/` Vite+React+TS+Tailwind+shadcn(-style, hand-rolled in `src/components/ui`). Features under `src/features/*`. TanStack Query (server state), Zustand (UI only). Router guards: `RequireAuth` + `RequirePermission`.
- Public no-auth APIs: `/leads/submit` (honeypot+rate-limit+dynamic-form validation), `/p/:slug` (landing pages), `/public/products|packages` (consumed by https://www.kratos-energy.com — CORS allowlisted), `/chatbot/webhook`.
- Branding: Kratos Sustainability, logo `frontend/public/logo.svg`, green #6abf2e / teal #175c4c.

## Databases

- **Active = remote**: `postgresql://kratos:kratos%402026@75.119.149.137:5432/kratos-backend` (password `kratos@2026`, `@`→`%40`). Native Postgres on that host (NOT the chatbot-postgres-1 docker container — its 5432 isn't published). Server admin: `sudo -u postgres psql`.
- Local fallback: PG17 service, `kratos`/`kratos` db `kratos_crm` (has CREATEDB for shadow).
- **Migration workflow**: `prisma migrate dev` against LOCAL to generate SQL → `prisma migrate deploy` (reads .env → remote). If migrate dev prompts (non-interactive error): `prisma migrate diff --from-migrations --to-schema-datamodel --shadow-database-url <local shadow db>` into a hand-made migration folder, then deploy. NEVER deploy an empty migration.sql (happened once — always check the SQL exists first).
- Seed: `npm run db:seed` (idempotent: roles/perms/sources/stages/admin).

## Run / test

- `./dev.sh` or `.\dev.ps1` starts both (frees stale ports first). Backend :4000, frontend :5173.
- Login: `admin@kratosenergy.com.au` / `Admin@12345`. Test reps: sam@/riley@kratosenergy.com.au / `Sales@12345`.
- Typecheck both: `npm run typecheck` in each dir. No test suite yet.

## Windows gotchas

- `pkill -f "tsx watch"` (Git Bash) can orphan the node child holding :4000 **with stale env** — kill by PID: PowerShell `Get-NetTCPConnection -LocalPort 4000`.
- Stop backend before `prisma generate` (EPERM: query engine DLL locked).
- Redis not installed — backend degrades to in-memory rate limiting (fine in dev).
- Preview screenshots flaky — use accessibility snapshots to verify UI.

## Conventions

- Secrets only in `backend/.env` (gitignored). `.env.example` = placeholders only (user once pasted real keys there — scrub if it happens again).
- Never commit `node_modules` (root `.gitignore` handles it). Repo: github.com/aaabir2a/kratos-energy-backend, branch `main` (default flip to main in GitHub settings may still be pending; `master` branch is a stale duplicate).
- API envelope `{success,data,meta}` / `{success,error:{code,message,details}}`. Prices snapshot at sale time; `final_price` computed in service layer (deliberate divergence from PDF's GENERATED column).
- Commit style: what+why, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
