# Mess Management — RFID Coupon System

Production rebuild of a cafeteria **RFID coupon** system: multi-user, role-based,
server-enforced business rules, and an offline-capable PWA counter. Target scale ~2,000
cardholders — **correctness > throughput**.

> The wallet (money-balance) model was retired — meals are **coupon-only**. The `wallets` /
> `wallet_transactions` tables remain in the schema but are no longer read or written.

> Planning docs are the source of truth: [plan.md](plan.md) (product),
> [db-schema.md](db-schema.md) (schema), [theme.md](theme.md) (design system).
> Working rules for contributors (and Claude Code) live in [CLAUDE.md](CLAUDE.md) and
> `.claude/rules/`.

## Tech stack (locked)

Next.js (App Router) + TypeScript · Route Handlers + Server Actions · Prisma · **PostgreSQL** ·
Auth.js (Credentials, RBAC) · Tailwind CSS (Warm Cafeteria theme) · Zod · PWA (service worker +
IndexedDB, counter only) · Vitest + Playwright.

## Getting started

Prerequisites: **Node ≥ 20.19 / 22.12** (Node 23 works with the pinned Prisma 6.5),
Docker (for local Postgres).

```bash
# 1. Install deps
npm install

# 2. Start Postgres
docker compose up -d

# 3. Configure env
cp .env.example .env        # then edit AUTH_SECRET (npx auth secret)

# 4. Apply schema + seed
npm run db:migrate          # creates the migration & applies it
npm run db:seed             # branch, roles, Super Admin, categories, meals, rates, settings

# 5. Run
npm run dev                 # http://localhost:3000
```

Default Super Admin (from the seed): `admin@mess.local` / `ChangeMe123!` — change immediately.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run test` / `test:watch` | Vitest unit tests |
| `npm run test:e2e` | Playwright (run `npx playwright install` once first) |
| `npm run db:migrate` / `db:deploy` | Prisma migrate (dev / production) |
| `npm run db:seed` / `db:studio` | Seed data / Prisma Studio |

## Project layout

```
app/
  (public)/   public self-service lookup (no auth)
  (auth)/     staff login
  (app)/      authenticated console (RBAC-gated) — dashboard, etc.
  counter/    full-screen RFID POS (offline PWA)
  api/        Route Handlers (counter, public, auth, health)
components/    shared UI (shell, ui) — theme tokens
services/      pure business logic (ledger, consumption, audit) — Phase-by-phase
lib/           wiring: prisma client, auth config, rbac guards
prisma/        schema.prisma + seed
types/         shared types
tests/         unit (Vitest) + e2e (Playwright)
```

## Status

**Phase 0 (Setup) complete:** toolchain, theme tokens (light/dark), app shell, Prisma schema +
seed, auth/RBAC scaffolding, test harness. Business modules follow the roadmap in
[plan.md](plan.md) §11. The schema's deferred decisions (coupon = count vs earmarked money, etc.)
remain open — see [db-schema.md](db-schema.md) §13.
