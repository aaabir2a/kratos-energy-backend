# Kratos Energy CRM

Lead-management CRM for an Australian solar company. Capture leads (website / social / chatbot / landing pages) → assign to sales reps → convert to deals → close won/lost. Master design in [`architecture_design.md`](architecture_design.md).

## Stack
- **Backend:** Node + TypeScript + Express + Prisma + PostgreSQL + Redis (optional) + JWT + Zod
- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn/ui + TanStack Query + Zustand

## Build status
| Phase | Scope | Status |
|------|-------|--------|
| 1 | Authentication, RBAC (4 roles), Offices, Users | ✅ Done |
| 2 | Leads, pipeline, round-robin assignment, activities | ✅ Done |
| 3 | Source tracking & intake | ⏳ Next |
| 4 | Pipeline, deals & close | Planned |
| 5 | Landing pages & forms | Planned |
| 6 | Catalog (products + packages) | Planned |

## Prerequisites
- Node 20+
- PostgreSQL 16/17 running locally (role `kratos` / db `kratos_crm`, or edit `backend/.env`)
- Redis optional (backend degrades gracefully without it)

## Run

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # adjust DATABASE_URL if needed
npm run prisma:migrate        # create tables
npm run db:seed               # seed roles, permissions, admin
npm run dev                   # http://localhost:4000/api/v1

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

## Default login
`admin@kratosenergy.com.au` / `Admin@12345` (change in `backend/.env` before seeding).

## Project layout
```
backend/   src/modules/{auth,users,roles,offices}  +  src/core  +  src/shared
frontend/  src/features/{auth,dashboard,users,roles,offices}  +  src/components/ui (shadcn)
```
"# kratos-energy-backend" 
