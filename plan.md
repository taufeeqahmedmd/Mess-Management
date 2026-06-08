# RFID Coupon Management System — Production Plan

> Status: living document. Started 2026-06-08.
> Supersedes the single-file PWA mock (`rfid-coupon.html`), which remains the reference for behavior.

---

## 1. Goal

Rebuild the cafeteria RFID coupon/wallet mock as a production, multi-user, role-based web
application with a real backend, real persistence, server-enforced business rules, and an
offline-capable RFID counter. Target scale: **~2,000 cardholders max** (small; correctness >
throughput).

---

## 2. Tech stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Full-stack — UI + API in one repo |
| Backend | **Route Handlers + Server Actions** | No separate Laravel/API service |
| ORM | **Prisma** | Type-safe, migrations |
| Database | **PostgreSQL** | Chosen for ledger correctness + constraints |
| Auth | **Auth.js (NextAuth)** — Credentials | Staff login + sessions; RBAC middleware |
| Styling | **Tailwind CSS** (+ light component layer) | Port the mock's design tokens / dark+light theme |
| Offline | **PWA**: service worker + IndexedDB queue | For the RFID Counter only |
| Validation | **Zod** | Shared client/server schemas |
| Testing | **Vitest** (unit) + **Playwright** (e2e) | Focus on ledger + counter logic |

RFID hardware: **USB reader acting as a keyboard** — types the card number + Enter into the
counter input. Captured via a keydown listener; no drivers/SDK.

---

## 3. High-level architecture

```
Next.js (App Router)
├─ /(public)              → cardholder self-service (public lookup, no auth)
├─ /(auth)               → staff login
├─ /(app)                → authenticated dashboard (RBAC-gated)
│   ├─ dashboard, users, cards, recharge, counter, settings, reports
├─ /counter              → full-screen POS (operator login, PWA, offline)
└─ /api/*                → Route Handlers (REST-ish) for the counter + integrations

Server layer
├─ services/             → ledger, consumption engine, RBAC, audit (pure, testable)
├─ prisma/               → schema + migrations + seed
└─ lib/auth, lib/rbac    → Auth.js config + permission guards

Client
├─ Service worker        → cache shell + intercept counter POSTs when offline
└─ IndexedDB             → offline tap queue (idempotent sync)
```

**Principle:** all money/consumption logic lives in **server-side services** inside a DB
transaction. The client never decides balances. The mock's client-side engine becomes the
spec for these services.

---

## 4. Roles & access (locked)

| Role | Scope |
|---|---|
| **Cardholder** | Not a login. Public self-service page: own balance + filtered history download. |
| **Canteen/Mess operator** | Signs in on a counter device. Runs the tap screen for assigned counters. System decides approve/reject; operator visually confirms the photo. No override. Identity stamped on each tap. |
| **Accounts** | Recharge; card activate/deactivate/replace; scoped reports. |
| **Admin** | Granular RBAC — Super Admin grants permissions per module × action. |
| **Super Admin** | Everything incl. categories/meals/rates/counters, roles & permissions, settings. |

**RBAC model:** permissions are strings `module.action` (e.g. `recharge.create`,
`cards.replace`, `users.view`). Roles bundle permissions. A staff account has one or more
roles. Every server action/route checks the required permission. Super Admin bypasses
(has all). Roles/permissions are seeded but editable by Super Admin.

Permission catalog (initial):
```
users.view|create|edit|delete|import
cards.view|replace|activate|deactivate
recharge.view|create|edit|delete
counter.operate
categories.manage  meals.manage  rates.manage  counters.manage
reports.view  dashboard.view
settings.manage  roles.manage  staff.manage
```

---

## 5. Data model (Prisma sketch)

> Key structural change from the mock: **cardholders ≠ staff**. Cardholders don't log in;
> staff do. Money (wallet) and meal coupons (counts) are **separate balances** so we can defer
> the count-vs-money decision without rework.

```prisma
// ---- Identity & access ----
model Category {
  id              String  @id @default(cuid())
  name            String  @unique
  identifierLabel String            // "Admission No." / "Employee ID"
  identifierRegex String?           // optional validation
  identifierRequired Boolean @default(true)
  identifierUnique   Boolean @default(true)
  status          Status  @default(ACTIVE)
  cardholders     Cardholder[]
  rates           Rate[]
}

model Cardholder {
  id          String   @id @default(cuid())
  name        String
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  identifier  String?            // roll/admission/employee no (login handle for self-service)
  mobile      String?
  email       String?
  department  String?
  branch      String?
  photoUrl    String?
  status      Status   @default(ACTIVE)   // ACTIVE | BLOCKED | INACTIVE
  joinDate    DateTime @default(now())
  walletBalance   Decimal @default(0) @db.Decimal(12,2)  // money; reconcilable from ledger
  cards       RfidCard[]
  coupons     CouponBalance[]
  recharges   Recharge[]
  transactions Transaction[]
  @@index([categoryId])
  @@index([identifier])
}

model StaffAccount {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  status       Status   @default(ACTIVE)
  roles        StaffRole[]
  counters     CounterOperator[]
}

model Role            { id String @id @default(cuid()) name String @unique permissions RolePermission[] staff StaffRole[] }
model Permission      { id String @id @default(cuid()) key String @unique roles RolePermission[] }
model RolePermission  { roleId String permissionId String @@id([roleId, permissionId]) }
model StaffRole       { staffId String roleId String @@id([staffId, roleId]) }

// ---- Cards (split so we can replace and keep history) ----
model RfidCard {
  id           String   @id @default(cuid())
  cardUid      String   @unique          // the value the reader emits
  cardholderId String
  cardholder   Cardholder @relation(fields: [cardholderId], references: [id])
  status       CardStatus @default(ACTIVE)   // ACTIVE | INACTIVE | LOST
  issueDate    DateTime @default(now())
  expiryDate   DateTime?
  isCurrent    Boolean  @default(true)
  events       CardEvent[]
}
model CardEvent {
  id        String   @id @default(cuid())
  cardId    String
  type      String   // REPLACE | ACTIVATE | DEACTIVATE | ISSUE
  oldUid    String?
  newUid    String?
  reason    String?
  staffId   String?
  at        DateTime @default(now())
}

// ---- Catalog & pricing ----
model Meal    { id String @id @default(cuid()) name String start String end String status Status @default(ACTIVE) rates Rate[] }
model Rate    { mealId String categoryId String price Decimal @db.Decimal(12,2) @@id([mealId, categoryId]) }
model Counter { id String @id @default(cuid()) name String location String? status Status @default(ACTIVE) operators CounterOperator[] }
model CounterOperator { counterId String staffId String @@id([counterId, staffId]) }

// ---- Money: recharges (grants) + transactions (taps) ----
model Recharge {
  id               String   @id @default(cuid())
  cardholderId     String
  amount           Decimal  @default(0) @db.Decimal(12,2)   // money credited to wallet
  couponMealId     String?                                   // if set → coupon grant for this meal
  couponCount      Int      @default(0)
  validTill        DateTime?
  remainingAmount  Decimal  @default(0) @db.Decimal(12,2)
  remainingCoupons Int      @default(0)
  expired          Boolean  @default(false)
  remarks          String?
  operatorId       String?                                   // staff who recharged
  createdAt        DateTime @default(now())
  @@index([cardholderId])
}

model CouponBalance {            // cached per-meal coupon count; reconcilable from recharges
  cardholderId String
  mealId       String
  count        Int    @default(0)
  @@id([cardholderId, mealId])
}

model Transaction {              // a tap at the counter
  id            String   @id @default(cuid())
  clientTxId    String   @unique            // idempotency key (offline-safe)
  cardholderId  String?
  cardUid       String
  counterId     String?
  operatorId    String?
  mealId        String?
  categoryId    String?                      // snapshot
  amount        Decimal  @default(0) @db.Decimal(12,2)  // money charged (0 if coupon)
  paidBy        String?                      // WALLET | COUPON | null
  status        TxStatus                     // APPROVED | REJECTED | BLOCKED | QUEUED
  reason        String?
  at            DateTime @default(now())
  syncedAt      DateTime?
  @@index([cardholderId])
  @@index([at])
}

// ---- System ----
model AuditLog { id String @id @default(cuid()) staffId String? action String target String? at DateTime @default(now()) ip String? }
model Setting  { key String @id value Json }   // duplicateWindow, preventPerMealSession, resolutionStrategy, etc.

enum Status     { ACTIVE INACTIVE BLOCKED }
enum CardStatus { ACTIVE INACTIVE LOST }
enum TxStatus   { APPROVED REJECTED BLOCKED QUEUED }
```

**Key DB constraints / integrity rules:**
- Unique `RfidCard.cardUid`; only one `isCurrent` card per cardholder (enforced in service +
  partial index).
- Idempotent taps via unique `Transaction.clientTxId` (offline sync can't double-charge).
- "Once per meal session" enforced server-side; optionally a partial unique index on
  `(cardholderId, mealId, dateBucket)` for approved taps.
- All balance mutations happen inside a single Prisma `$transaction`.

---

## 6. Consumption / money model (PROVISIONAL — to finalize later)

Decision deferred: whether a coupon is a **meal count** (1 coupon = 1 meal, price-independent)
or **earmarked money**. To avoid blocking, the schema keeps **both balances separate** (wallet
money + per-meal coupon counts), exactly like the mock.

**Default tap resolution (configurable in Settings):**
1. Compute the meal price for the cardholder's category.
2. If they have a coupon for that meal → consume one coupon (`paidBy = COUPON`, amount = 0).
3. Else if wallet ≥ price → deduct price (`paidBy = WALLET`).
4. Else → `REJECTED` (insufficient).

`Setting.resolutionStrategy` can later switch to `wallet-only`, `coupon-only`,
`coupon-first` (default), or `per-category` without schema changes.

**Recharge** writes a `Recharge` row and updates the cached balance(s):
- money → `walletBalance += amount`
- coupon grant (couponMealId set) → `CouponBalance.count += couponCount`
Edits/deletes reverse the *remaining* portion first (port `reverseRecharge`/`applyRecharge`).
Validity expiry job claws back remaining money + coupons (port `expireRecharges`).

---

## 7. Module specs (mapped from the mock)

| # | Module | Source tab | Production notes |
|---|---|---|---|
| 1 | **Auth & RBAC** | (new) | Staff login, sessions, role/permission guards, seed Super Admin |
| 2 | **Master data** | Configurations | Categories (+identifier config), meals, rate matrix, counters, counter-operator assignment |
| 3 | **Cardholders** | Users | CRUD, search, status block/unblock, CSV bulk import + sample, CSV export |
| 4 | **RFID cards** | RFID Cards | Replace (with history), activate/deactivate, expiry |
| 5 | **Recharge & ledger** | Recharge | Wallet top-up + coupon grant, validity, edit/delete with reversal, receipt/history |
| 6 | **RFID Counter** | RFID Counter | Operator login on device, server-side tap engine, photo verification UI, beep, recent taps |
| 7 | **Offline/PWA** | (offline queue) | Service worker + IndexedDB queue + idempotent sync |
| 8 | **Dashboard** | Dashboard | KPIs, usage by category/meal/counter, date-range picker |
| 9 | **Reports** | Reports | Consumption report, balance report, audit log, CSV exports |
| 10 | **Self-service** | (new) | Public page: balance + filtered history download |
| 11 | **Branches & org** | (new) | Multi-branch: branches, departments, branch-scoped staff/users/counters/rates |
| 12 | **Vendor settlement** | (new) | Vendors + period settlements (meal counts → payable amount) |

---

## 8. RFID Counter & offline design (the critical path)

- **Operator login**: counter device authenticates a staff account; only their assigned active
  counters are selectable. Operator id stamped on every tap.
- **Tap capture**: keydown listener on a focused input; reader emits digits + Enter. Heuristic
  to distinguish fast reader bursts from manual typing (inter-key timing).
- **Online tap**: POST `/api/counter/tap` `{ cardUid, counterId, clientTxId }` → server runs the
  consumption engine in a transaction → returns APPROVED/REJECTED/BLOCKED + cardholder photo,
  name, category, balances. UI shows the big result + beep.
- **Offline tap**: service worker detects no network → store `{cardUid, counterId, clientTxId,
  at}` in IndexedDB, show "QUEUED". On reconnect, replay queued taps to `/api/counter/tap`;
  server is idempotent on `clientTxId`. Balances reconcile server-side (a tap may now reject if
  balance ran out — surfaced in a sync report).
- **Verification**: result screen shows the photo prominently for the operator to match.

> Note: offline taps mean a card *could* overspend if it taps offline at two counters. Accept
> this as a known trade-off (small scale, supervised counters); the sync report flags any
> resulting negative reconciliations.

---

## 9. API surface (initial)

```
POST /api/auth/[...nextauth]          staff login
POST /api/counter/tap                 process a tap (idempotent)
POST /api/counter/sync                bulk replay offline queue
GET  /api/cardholders?q=              search (app)
...                                    CRUD per module via Server Actions where possible
GET  /api/public/balance?id=          self-service lookup (public)
GET  /api/public/history?id=&from=&to=&meal=   self-service history (public, CSV)
```
Most authenticated mutations use **Server Actions** with permission guards; the counter and
public endpoints are **Route Handlers** (need explicit POST/idempotency/CSV).

---

## 10. Security & integrity

- Server-enforced everything: balances, duplicate window, once-per-session, blocked cards.
- Permission check on every action; deny by default.
- Audit log for every state change (who/what/when/ip).
- Self-service is **public lookup** for now — flagged privacy risk; optional ID + non-public
  field (mobile/DOB) mitigation pending decision. Rate-limit the public endpoints regardless.
- CSV import validated row-by-row; reject duplicates by identifier/cardUid.
- Decimal money (never float); all mutations transactional.

---

## 11. Phased roadmap

| Phase | Deliverable | Mock parity |
|---|---|---|
| **0. Setup** | Next.js + TS + Tailwind + Prisma + Postgres, env, base layout + theme ported, CI | — |
| **1. Auth & RBAC** | Staff login, roles/permissions, guards, seed Super Admin | (new) |
| **2. Master data** | Categories (+identifier), meals, rates, counters, operators | Configurations |
| **3. Cardholders & cards** | CRUD, import/export, block, replace/activate/deactivate + history | Users + Cards |
| **4. Recharge & ledger** | Wallet + coupon grants, validity/expiry, edit/delete reversal, receipts | Recharge |
| **5. RFID Counter** | Operator login, server tap engine, verification UI, rules, beep | RFID Counter |
| **6. Offline/PWA** | Service worker, IndexedDB queue, idempotent sync, sync report | Offline queue |
| **7. Dashboard & reports** | KPIs, usage breakdowns, date range, CSV, audit log | Dashboard + Reports |
| **8. Self-service** | Public balance + filtered history download | (new) |
| **9. Vendor settlement** | Vendors + period settlements (meal counts → payable) | (new) |
| **10. Hardening & deploy** | Validation, rate limits, tests, audit completeness, deployment | — |

> Multi-branch (branches, departments, branch scoping) is folded into Phase 2 (master data) and
> applied across all later phases. DB = **PostgreSQL** (confirmed); see `db-schema.md`.

Each phase ends with: migrations + seed updated, tests for that module, and a working demo.

---

## 12. Project setup (Phase 0 concrete steps)

1. `npx create-next-app@latest` (App Router, TS, Tailwind, ESLint).
2. Add Prisma + Postgres; `prisma init`; commit `schema.prisma` (section 5).
3. Auth.js with Credentials provider + Prisma adapter.
4. Port theme tokens from `base-theme.css` into Tailwind config (keep dark/light).
5. App shell: sidebar nav, header, theme toggle (mirror the mock).
6. Seed script: Super Admin account, default roles/permissions, categories, meals, rates,
   counters (mirror the mock's seed data).
7. `.env.example`, README, Docker compose for local Postgres.

Proposed folder layout:
```
/app  /(public) /(auth) /(app) /counter /api
/components  /services  /lib  /prisma  /types  /tests
```

---

## 13. Open decisions (deferred — revisit before the phase that needs them)

| Topic | Needed by | Status |
|---|---|---|
| Coupon = count vs money; tap priority | Phase 4–5 | **Deferred** (schema supports both) |
| Self-service second field (privacy) | Phase 8 | Pending — pure public lookup vs ID + mobile/DOB |
| Deployment: cloud vs on-premise LAN | Phase 9 | Parked (affects offline aggressiveness) |
| RFID hardware specifics (reader model, prefix/suffix) | Phase 5 | Parked |
| Notifications (SMS/email on low balance/recharge) | v2 | Out of scope for v1 |
| Online recharge / payment gateway | v2 | Out of scope for v1 (Accounts-counter only) |

---

## 14. Non-goals (v1)

- No online/self-service recharge or payment gateway (Accounts-counter recharge only).
- No cardholder login/passwords (public lookup only).
- No native mobile app (PWA only).

> Note: **multi-branch IS in v1** (branches within one institution — not multi-tenant SaaS).
> **Vendor settlement IS in v1.**
```
