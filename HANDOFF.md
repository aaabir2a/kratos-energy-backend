# Kratos CRM — session handoff

Working state as of **25 Aug 2026**. Read `CLAUDE.md` first for the product/architecture
picture; this file covers the operational reality — databases, deploy, what's broken,
what's next.

Repo: `github.com/aaabir2a/kratos-energy-backend` · branch **`main`** · HEAD `aaec0e5`
(`master` is a stale duplicate — ignore it, and never deploy from it).

---

## 1. Databases — three of them, don't mix them up

| # | Name | Where | Used for |
|---|---|---|---|
| 1 | `kratos-backend` | `75.119.149.137:5432` — **native** Postgres 16 on the VPS | **LIVE PRODUCTION.** Real customer leads. Never point local dev here. |
| 2 | `kratos_test` | `75.119.149.137:5433` — inside the `postgres-db` **container** | **Shared team dev DB.** A copy of live, safe to break. This is what `backend/.env` points at. |
| 3 | `kratos_dev` | `localhost:5432` (local PG17) | Clean seeded DB. Used to **generate** migrations, and for the seeded test staff. |

Also present: `kratos_crm` (local, legacy — kept as the shadow DB for `prisma migrate diff`),
and a local `kratos_test` left over from an earlier approach — superseded by #2, safe to drop.

**Two different Postgres servers live on the VPS.** Port 5432 is the native install holding
production; port 5433 is a Docker container (`postgres-db`, superuser **`rag`**, shared with
another project). Creating the test DB there kept production untouched.

### Connecting
- Credentials live in `backend/.env` (gitignored) and, for the server, in `~/kratos/backend/.env`.
- The `kratos` role on production **cannot create databases** (`rolcreatedb=f`), so anything
  needing `CREATE DATABASE` on the VPS goes through `docker exec ... psql -U rag`.
- For one-off admin work against production, pass the URL inline for a single command rather
  than editing `.env`.

### Refreshing the shared test DB from live
`pg_dump` production (read-only) → drop/recreate `kratos_test` in the container → `pg_restore`.
There's a script for this at `/root/refresh-kratos-test.sh` on the server; its `psql` calls need
`-U rag -d rag`. **A refresh destroys whatever the team has been testing with** — it's a full
replace, not a merge.

### Migration workflow (important)
1. Generate against **local `kratos_dev`**:
   `DATABASE_URL=postgresql://kratos:kratos@localhost:5432/kratos_dev npx prisma migrate dev --name <name>`
2. Check the generated `migration.sql` is not empty (this has bitten before).
3. Apply to the shared test DB: `npx prisma migrate deploy` (reads `.env`).
4. Apply to production **on the server** — see §3.

14 migrations as of HEAD. Latest: `20260815064521_enquiry_type_residential_commercial`.

---

## 2. Run locally

```bash
./dev.sh          # or .\dev.ps1 — starts backend :4000 + frontend :5173
```
Typecheck: `npm run typecheck` in `backend/` and `frontend/`. No test suite exists.

Login for the **shared test DB** uses the production user list (real staff accounts, copied).
The seeded test reps (`sam@`, `riley@`, `morgan@`, `casey@` / `Sales@12345`) only exist in
local `kratos_dev`.

Windows gotchas: stop the backend before `prisma generate` (the query-engine DLL locks, EPERM);
kill stale node by PID via `Get-NetTCPConnection -LocalPort 4000`, not `pkill`.

---

## 3. Deploy

Server: `deploy@vmi3296479`, app at **`~/kratos`** (not `~/apps/kratos` as DEPLOY.md says).
Docker Compose: `api` + `web` + internal `redis`, bound to `127.0.0.1`, host nginx proxies
`api.kratos-energy.com` and `crm.kratos-energy.com`. The database is **not** containerised.

```bash
cd ~/kratos && git pull && docker compose up -d --build
```

### ⚠️ The migrate trap — cost an outage once
`docker compose up -d --build` only rebuilds the **default profile** (api, web, redis). The
`migrate` service sits in the `tools` profile, so `docker compose run --rm migrate` happily
reuses a **months-old image** and reports "No pending migrations" against a stale copy of
`prisma/migrations`. Always rebuild it first:

```bash
docker compose --profile tools build migrate
docker compose --profile tools run --rm migrate                       # migrate deploy
docker compose --profile tools run --rm migrate npx prisma migrate status
```
Sanity check: the status output must say **14 migrations found**. Fewer = stale image.

DEPLOY.md still documents the broken sequence — worth fixing.

---

## 4. Email — currently BROKEN in production

Switched from Gmail SMTP to **Resend** (`backend/src/core/mail/mailer.ts`). The provider is
chosen by `MAIL_PROVIDER` (`auto`|`resend`|`smtp`); `auto` prefers Resend when
`RESEND_API_KEY` is set, else falls back to nodemailer SMTP.

**Blocker:** every send fails with
`The kratos-energy.com domain is not verified`. The API key is valid — the domain isn't.

To fix (dashboard + DNS, no code):
1. resend.com/domains → add **`send.kratos-energy.com`** (a subdomain, not the root — it
   isolates sending reputation and won't disturb existing mail on the root domain).
2. Add the DKIM TXT / SPF TXT / MX records at the DNS provider. Watch the host field: many
   providers auto-append the domain, producing `send.kratos-energy.com.kratos-energy.com`.
3. Set `MAIL_FROM=Kratos Sustainability <crm@send.kratos-energy.com>` in the server `.env`.
   **`MAIL_FROM` must be on the verified domain** or SPF/DKIM alignment fails and DMARC files
   it as spam.
4. Add DMARC TXT at `_dmarc.kratos-energy.com`: `v=DMARC1; p=none; rua=mailto:info@kratos-energy.com`,
   tightening to `p=quarantine` then `p=reject` later.

Verify:
```bash
docker compose logs api | grep -i "Mail:"                    # expect "Resend ready"
docker compose exec api node dist/scripts/sendTestEmail.js you@example.com
npm run mail:test -- you@example.com                         # local equivalent
```
Stopgap while DNS propagates: `MAIL_FROM=Kratos CRM <onboarding@resend.dev>` delivers, but
**only to the Resend account owner's own address**.

### History worth knowing
The Gmail app password was revoked when 2-Step Verification was reset. Sends are
fire-and-forget, so notification emails failed silently for **nine days** before anyone
noticed. `verifyMailConfig()` now runs at boot and logs loudly — don't remove it. A key
scoped to sending only can't call `domains.list()`; that's handled and reported as healthy.

---

## 5. Notifications — a gap that isn't a bug

`app_settings.leads.autoAssign = false` in production. Round-robin is off, so captured leads
stay **unassigned**, and `lead.assigned` never fires — no sales rep is notified about anything.
Only managers/admins get the in-app `lead.created` notice.

Turn on in **Administration → Lead Assignment**, or decide manual assignment is intended and
build an "unassigned lead waiting" notification. Currently only 1 `lead.assigned` notification
has ever been sent, for a manually assigned lead.

Shared recipients (`notify.adminEmails`): `aaabir2a@gmail.com`, `sikandarsifat2@gmail.com`,
`info@kratos-energy.com`.

---

## 6. Most recent feature — residential / commercial split

Shipped in `4ca5361`, live in production.

- `leads.enquiry_type` — enum, `NOT NULL DEFAULT 'RESIDENTIAL'`, indexed. Existing rows
  backfilled to residential.
- `custom_lead_forms.enquiry_type` — fixed per marketing form (asked at creation, editable
  later); **null on the global site form**, where the visitor picks.
- Website lead form: "Enquiry type" is a mappable core field (`maps_to: enquiryType`),
  required on save, must offer both options. The quick-add button **adopts an existing
  unmapped enquiry field** rather than adding a duplicate.
- Resolution order on intake: form-fixed → visitor-mapped value → top-level input → default.
  Labels are normalised, so "Commercial solar" and "commercial" both work.
- Leads page: Residential / Commercial tabs driving the list, stat cards and CSV export.
  Enquiry type is editable from the Edit lead dialog and shown on the detail card.
- Repeat enquiries deliberately **do not** retype an existing lead.

⚠️ Production's site form has an "Enquiry Type" dropdown that may still be **unmapped**.
Until someone opens `/website/lead-form` and saves once, every website lead defaults to
residential regardless of what the visitor picked.

---

## 7. Open items

| Item | Notes |
|---|---|
| Verify Resend domain | Blocks all notification email. Highest priority. |
| Re-send jamie's missed email | Lead `02de22d7-…`; its `lead.created` email failed during the SMTP outage. Needs a one-off script against `dist/core/mail/mailer`. |
| Map the production site form | `/website/lead-form` → save once. |
| Decide on auto-assign | On, or build an unassigned-lead alert. |
| Fix DEPLOY.md | Wrong app path, and the `tools` rebuild step is missing. |
| Guard `db:reset` | It runs `prisma migrate reset --force` against whatever `DATABASE_URL` points at — which is now the **shared** test DB. It would wipe the team's data. |
| P8 analytics, P9 hardening | Backups + monitoring are the real gap; the system holds the customer list. |

---

## 8. Test data hygiene

Production has been used for manual testing more than once. Test leads have been hard-deleted
(`leads` + `notifications` + `lead_attributions` + `form_submissions` + `lead_activities`, in a
transaction). **8 leads remain, 3 of them still test rows** from 15 Aug (`test 2` ×2, `test 3`).

Prefer testing against the shared test DB (#2). If you must delete from production, check
`deals` and `chat_conversations` first — the API's own `DELETE /leads/:id` is a *soft* delete
(`deleted_at`) and is the reversible, audited option.

---

## 9. Secrets

Only in `backend/.env` (gitignored) and the server's own `~/kratos/backend/.env`.
`.env.example` / `.env.production.example` hold placeholders only — keep it that way; real keys
have been pasted into an example file before.

Note: `CLAUDE.md` currently contains the production database password in plain text. It's in
git history. Worth rotating and replacing with a pointer to a password manager.
