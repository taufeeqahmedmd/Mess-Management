# Mess Management — RFID Coupon System

A production cafeteria management system built around **RFID coupons**: multi-branch,
multi-role, server-enforced business rules, and an offline-capable PWA counter for meal
redemption. Target scale ~2,000 cardholders per branch — **correctness over throughput**.

> **Coupon-only.** The original money-balance "wallet" model was retired — every meal is paid by
> **coupon** (a per-meal-type count), not a cash balance. Recharges grant coupons; taps and food
> deliveries consume them. The `wallets` / `wallet_transactions` tables remain in the schema for
> historical compatibility but are dormant — never read or written.

> **Planning docs are the source of truth:** [plan.md](plan.md) (product/roadmap),
> [db-schema.md](db-schema.md) (schema), [theme.md](theme.md) ("Bhojan Tricolour" design system).
> Contributor / Claude Code working rules live in [CLAUDE.md](CLAUDE.md) and `.claude/rules/`.
> Deployment runbook: [DEPLOY.md](DEPLOY.md). Latest static audit: [AUDIT-REPORT.md](AUDIT-REPORT.md).

---

## What's in the app

**Cardholder & card management**
- Cardholder ("Users") CRUD, bulk CSV import, RFID card issue/replace/activate/deactivate history.
- Cardholder categories (Student / Employee / Contractor / Guest / Visitor, extensible) with a
  configurable identifier field (label, format, required/optional) and a per-category **contact
  required** toggle (phone + email mandatory or not, e.g. required for Employee, optional for
  Student).
- Branch scoping throughout: a branch-scoped admin only ever sees their own branch's data; a
  Super Admin (branch = "all") sees everything.

**Counter — the RFID redemption terminal**
- Full-screen offline-capable PWA at `/counter`. The RFID reader acts as a keyboard; a focused
  input captures the burst and distinguishes it from manual typing by inter-key timing.
- Every tap is idempotent (`clientTxId`), resolved server-side (coupon-first), and enforces
  duplicate-tap windows, once-per-meal-session, "active meal now," and blocked cards.
- **Offline queueing**: taps made while offline persist to IndexedDB and auto-flush via
  `/api/counter/sync` on reconnect; a service worker (`public/sw.js`) caches the counter shell +
  static assets (never POSTs) so the terminal keeps working without a connection. This offline
  behavior is scoped to `/counter` only — the rest of the console requires a live connection.

**Recharges**
- Grant coupons per meal type against a cardholder, with payment mode, validity, and remarks.
- Edits/reversals are append-only ledger corrections — never mutate a posted row.
- Bulk import, receipt view, and a searchable recharge log (surfaced under Reports).

**Public self-service top-up (`/top-up`, no login)**
- A cardholder looks up their balance/history by their public **ID** code and can pay online to
  add coupons, without ever logging in.
- Backed by rate-limited public API routes and the **Jodo** payment gateway (see below).

**Food requests**
- Ad-hoc catalog orders (beverages/snacks/meals/custom items) raised against a cardholder's RFID
  account, catalog-priced, with an optional approval workflow (configurable threshold/approver).
- A **vendor portal** (`/vendor-dashboard`, `/vendor-orders`) lets a caterer accept/prepare/deliver
  their routed orders; delivery is gated by an RFID tap and moves money only at that point.
- Food-item catalog and delivery-location suggestions are **branch-specific** (an item/location
  can be scoped to one branch or offered everywhere).

**Vendor settlement**
- Settlement runs reconcile a vendor's delivered orders against their agreed vendor cost, per
  period, with a per-vendor detail view.

**Reports**
- A tabbed hub: consumption, food requests, recharges, balances, and the full audit log.

**Settings (master data)** — under `Settings`, each independently permissioned:
Branches · Staff · Counters · Categories · Meals · Rates (meal × category × branch, date-versioned)
· Vendors · Consumption (per-category coupon-model config: duplicate window, meal-session
restriction) · Food Items · Delivery Locations · Food Requests (approval workflow config).

**Notifications** — three channels, each with a rules editor (per-event, instant vs. daily
digest), a template manager, and a send log:
- **Push** — Web Push (VAPID) to the staff/vendor PWA.
- **Email** — SMTP, per-sending-identity (e.g. separate "Pallavi"/"DPS" entities each with their
  own from-address), mapped per branch.
- **WhatsApp** — via a Smartping partner integration (template fetch/sync + send).

**Access control**
- RBAC as flat `module.action` permission strings, deny-by-default, Super Admin bypasses all
  checks. An **Access Control** screen lets you edit the role × permission grid directly. Seeded
  roles: **Super Admin**, **Admin**, **Mess Incharge** (runs the counter), **Accountant**,
  **Management** (read-only oversight), **Vendor** (caterer portal only).

**Payments (Jodo gateway)**
- Each **branch** has its own Jodo account, configured in the `payment_config` table:
  collector code + API base URL + API key/secret. This is **DB-managed only** — there is no
  environment-variable fallback and no UI to edit the credentials (the branch settings screen
  shows read-only status: configured / incomplete). A branch can't take online payments until its
  row is fully populated. Credentials are never sent to the browser.
- A staff-triggered and cron-friendly `/api/payments/reconcile` endpoint settles any online
  top-up whose payment callback never fired.

---

## Tech stack (locked — see [CLAUDE.md](CLAUDE.md) before swapping anything)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript, React 19 |
| Backend | Route Handlers + Server Actions (no separate API service) |
| ORM | Prisma 6.5 — source of truth for schema + migrations |
| Database | PostgreSQL |
| Auth | Auth.js v5 (Credentials — **mobile number + password**), RBAC middleware |
| Styling | Tailwind CSS v4, mapped to the "Bhojan Tricolour" theme tokens |
| Validation | Zod (shared client/server schemas) |
| Money | `Decimal.js` / Prisma `Decimal` end-to-end — never float |
| Offline | PWA: service worker + IndexedDB queue (counter only) |
| Charts | Recharts |
| Email / Push | Nodemailer (SMTP) / `web-push` (VAPID) |
| Testing | Vitest (unit) + Playwright (e2e) |

---

## Getting started

Prerequisites: **Node 20 LTS** (Next 16 needs ≥18.18; Prisma 6.5 is validated on 20), Docker (for
local Postgres).

```bash
# 1. Install deps
npm install

# 2. Start Postgres (host port 5433, to avoid clashing with a local Postgres on 5432)
docker compose up -d

# 3. Configure env
cp .env.example .env        # then edit AUTH_SECRET: npx auth secret

# 4. Apply schema + seed
npm run db:migrate          # creates & applies the migration
npm run db:seed             # branch, roles, Super Admin, categories, meals, rates, settings

# 5. Run
npm run dev                 # http://localhost:3000
```

Default Super Admin (from the seed) — **login is by mobile number, not email**:
`9281122104` / `ChangeMe123!` — change this password immediately in a real deployment. Other
seeded logins (same default password): Admin `9000000001`, Mess Incharge `9000000002`, Accountant
`9000000003`, Management `9000000004`, Vendor `9000000005`.

### Environment variables

Only `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_URL` are required to run the app locally.
Everything else unlocks an optional feature and degrades gracefully when unset:

| Variable(s) | Unlocks |
|---|---|
| `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` | Core app (required) |
| `APP_TIMEZONE` | IANA timezone for meal windows / rate versioning (defaults `Asia/Kolkata`) |
| `APP_URL` | Absolute app URL used to build the Jodo payment callback |
| — *(none — see below)* | **Jodo payment gateway** — configured per-branch in the DB (`payment_config` table), not via env. See "Payments" above. |
| `SMTP_PALLAVI_*`, `SMTP_DPS_*` | Email notifications (one SMTP account per sending entity) |
| `SMARTPING_*`, `PINBOT_*` | WhatsApp notifications (Smartping partner API) |
| `VAPID_*` | Web Push notifications |
| `CRON_SECRET` | Authenticates scheduled hits to `/api/payments/reconcile` and `/api/notifications/digest` |

Until the optional vars are set, the notifications module logs sends as "skipped" instead of
failing, and branches without a `payment_config` row simply can't take online payments — nothing
else breaks.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run test` / `test:watch` | Vitest unit tests (single run / watch) |
| `npm run test:e2e` | Playwright e2e (run `npx playwright install` once first) |
| `npm run db:migrate` / `db:deploy` | Prisma migrate (dev, creates+applies / production, applies only) |
| `npm run db:seed` | Seed branch, roles, Super Admin, categories, meals, rates, settings |
| `npm run db:sync-permissions` | Sync the permission catalog into an existing DB without reseeding |
| `npm run db:sync-entities` | Sync notification sending entities without reseeding |
| `npm run db:studio` | Prisma Studio (DB GUI) |
| `npm run db:generate` | Regenerate the Prisma client |

---

## Project layout

```
app/
  (public)/top-up/     public self-service balance lookup + online top-up (no auth)
  (auth)/login/        staff login (mobile + password)
  (app)/               authenticated console (every route RBAC-gated):
    dashboard, vendor-dashboard, access-control, profile, cards, users,
    recharge, food-requests, vendor-orders, settlements, reports, search,
    notifications/{push,email,whatsapp}, settings/{branches,staff,counters,
    categories,meals,rates,vendors,consumption,food-items,
    delivery-locations,food-requests}
  counter/             full-screen offline RFID POS (PWA)
  api/                 Route Handlers: auth, counter (tap/sync), food-requests,
                        notifications, payments (reconcile), public (balance/
                        history/recharge-options/pay/pay-callback), recharges,
                        reports, settings, settlements, users, health
components/            shared UI (shell, ui/) — theme-token driven
services/              pure, testable business logic — consumption, coupon
                        balance, pricing, rates, recharge ledger, settlement,
                        food-request fulfillment/reporting, notifications,
                        search, meal windows, public lookup
lib/                   wiring — prisma client, auth config, rbac/access-control,
                        session guards, audit, jodo (payment gateway), offline
                        queue, notifications senders, rate limiting
prisma/                schema.prisma (source of truth) + migrations + seed
tests/                 unit (Vitest) + e2e (Playwright)
```

---

## Status

The system is past initial setup and covers the full cafeteria workflow end-to-end: cardholder
and card management, counter redemption (online + offline), recharges, public self-service
online top-up, food requests with a vendor portal, vendor settlement, multi-channel
notifications, full RBAC/access control, and per-branch payment gateway configuration. Deferred
schema decisions (if any) are tracked in [db-schema.md](db-schema.md) §13 and [plan.md](plan.md)
§13 — check there before assuming a design question is settled.
