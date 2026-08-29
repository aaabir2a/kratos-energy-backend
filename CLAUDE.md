# Kratos Sustainability CRM — project context

Lead-management CRM for Kratos Energy (Australian solar). Core loop: capture leads (website / landing pages / social / chatbot) → attribute source → auto-assign (round-robin) → convert to deal → close won/lost. Blueprint: `architecture_design.md` (implementation-status section at top). Paused expansion plan: `hubspot_parity_plan.md` (decisions §5 pending).

## Status

Phases 1–6 built + verified: auth/RBAC(4 roles: admin/manager/marketing/sales), leads+pipeline+round-robin, source attribution (first/last touch, UTM/gclid/fbclid), deals (convert/close, snapshot-priced items), landing pages + dynamic form engine (versioned `fields_schema`, server-validated), catalog (PDF schema: products/packages/package_products). Remaining: P8 analytics, P9 hardening.

**P7 Notifications live** (email + in-app, no SMS): `notifications` table (in-app feed) + `app_settings` (JSON kv, first use `notify.adminEmails`). Events fire-and-forget from services — lead.created (→ managers/admins in-app + shared inbox email), lead.assigned (→ rep), deal.won/lost (→ owner+managers). Email via `core/mail/mailer.ts` — **Resend** (`RESEND_API_KEY`, preferred) with nodemailer SMTP (`SMTP_*`) as fallback, picked by `MAIL_PROVIDER` (auto|resend|smtp). Also `MAIL_FROM` (must be on the provider-verified domain or it's spam-filed), `MAIL_REPLY_TO`, `APP_BASE_URL` for deep links, `NOTIFY_ADMIN_EMAILS` fallback. Neither configured = email skipped, in-app still works. `verifyMailConfig()` runs at boot and logs loudly on a bad key/password (a dead Gmail app password once went unnoticed for 9 days). Test a config: `npm run mail:test -- you@example.com`. API `/notifications` (feed/unread-count/read-all/:id/read) + `/notifications/settings` (settings.read/write). UI: top-bar bell (30s poll) + Administration → Notifications (shared recipients). Staff notified at their own user email; shared recipients editable in-app.

**Hero image system live**: `POST /media/hero` (multipart, variant DESKTOP 16:9 min 2400×1350 / MOBILE 3:4 min 1080×1440), originals + WebP renditions in MinIO (creds in backend/.env, bucket kratos-uploads, hero/* public-read), public `GET /public/hero-images` → `{desktop:[],mobile:[]}`. UI: Website Settings → Image Uploads (full-res cropper on aspect mismatch). sharp needs Windows paths, not Git Bash /tmp.

**Chatbot platform integration live** (guide: `D:\Kratos-office\chatbot\CRM_DEVELOPER_GUIDE.md`, platform api.ambrosianuk.com, X-CRM-Key): HMAC webhook receiver `/api/v1/chatbot/webhook`, auto lead ingestion w/ dedupe+enrichment, transcript mirror (chat_conversations/chat_messages), Chat Inbox UI at `/chat` (replay, live takeover/reply/release, 4s polling), `POST /chatbot/sync?full=true` backfill, lead status write-back. Real keys in `backend/.env` (never commit).

## Architecture

- `backend/` Node22+TS+Express+Prisma. Modules under `src/modules/*` (routes→controller→service→repository, Zod at edges). RBAC catalog: `src/shared/constants/rbac.ts` (seed re-provisions roles/perms). Swagger from Zod: `/api/v1/docs` (`src/core/openapi/registry.ts` — add paths per feature).
- `frontend/` Vite+React+TS+Tailwind+shadcn(-style, hand-rolled in `src/components/ui`). Features under `src/features/*`. TanStack Query (server state), Zustand (UI only). Router guards: `RequireAuth` + `RequirePermission`.
- Public no-auth APIs: `/leads/submit` (honeypot+rate-limit+dynamic-form validation), `/p/:slug` (landing pages), `/public/products|packages` (consumed by https://www.kratos-energy.com — CORS allowlisted), `/chatbot/webhook`.
- Branding: Kratos Sustainability, logo `frontend/public/logo.svg`, green #6abf2e / teal #175c4c.

## Databases

Three of them, plus a shadow. Pick deliberately — the wrong one is either a team-wide
data loss or a production incident.

- **Shared test DB `kratos_test` — what `backend/.env` points at for local work**:
  `75.119.149.137:5433`, inside the `postgres-db` Docker container (superuser `rag`,
  shared with another project). A `pg_dump` copy of live: safe to break, but **shared with
  the team** — your writes are everyone's writes, and the refresh script
  (`/root/refresh-kratos-test.sh`) is a full drop-and-restore, not a merge. Log in with the
  copied production accounts. **Local testing only — never wire this into the deployed app.**
- **Clean local DB `kratos_dev`**: `postgresql://kratos:kratos@localhost:5432/kratos_dev` on
  the PG17 service. Used to **generate** migrations and for the seeded test staff: `sam@`/`riley@`
  (sales), `morgan@` (manager), `casey@` (marketing) — all `Sales@12345`.
  ⚠️ `npm run db:reset` runs `prisma migrate reset --force` against **whatever `DATABASE_URL`
  currently is** — it has no guard. It is safe only with `kratos_dev` active. Check `.env`
  before running it, or you will wipe the shared test DB.
- **Remote production `kratos-backend`**: `75.119.149.137:5432`, **native** Postgres on the VPS
  (NOT a docker container — the chatbot container's 5432 isn't published). Real customer leads.
  The `kratos` role there cannot `CREATE DATABASE` (`rolcreatedb=f`); anything needing that goes
  through the container's `rag` superuser. Credentials live in the server's own
  `~/kratos/backend/.env` and a password manager — **not in this repo**. For one-off admin work
  pass the URL inline for a single command rather than editing `.env`.
- `kratos_crm` is the older local DB (kept as the shadow DB for `migrate diff`).
- **Migration workflow**: `prisma migrate dev` against **`kratos_dev`** to generate SQL →
  `prisma migrate deploy` (reads `.env`) to apply. If migrate dev prompts (non-interactive error):
  `prisma migrate diff --from-migrations --to-schema-datamodel --shadow-database-url <local shadow db>`
  into a hand-made migration folder, then deploy. NEVER deploy an empty migration.sql (happened
  once — always check the SQL exists first). 14 migrations as of `ff1b69c`.
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
