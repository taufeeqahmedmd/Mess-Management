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
│   ├─ dashboard, vendor-dashboard, users, cards, recharge, counter,
│   │   settings (configurations), access-control, reports
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

## 4. Roles & access

### 4.1 What the mock actually does (authoritative behavior)

- **Login = mobile number + password** (not email). There is a **hardcoded super-admin**
  account (`Srikanth` / mobile `9281122104`) plus a `portalEmployees` table; the auth handle is
  the **mobile number**. A "Change Password" flow lets the signed-in employee reset their own
  password (min 6 chars, verifies current password).
- **Staff roles in the mock:** `Admin`, `Mess Incharge`, `Accountant`, `Management`.
- **RBAC is a matrix:** `role × screen × {view, add, edit, delete}` stored under
  `state.accessControl`. The Access Control screen lets an admin toggle each cell (with
  Select-All / Clear per screen). Nav tabs are shown/hidden from the role's `view` flag; `Admin`
  always sees everything. Screens governed: dashboard, vendorDashboard, counter, users, cards,
  recharge, settings (Configurations), accessControl, reports.
- **Operators** (e.g. Mess Incharge) are assigned to **counters** (`counter.assignedUserIds`);
  the **Vendor Dashboard** shows only the vendor revenue for *their* assigned counters.

### 4.2 Production model (locked decisions)

| Role | Scope |
|---|---|
| **Cardholder** | Not a login. Public self-service page: own balance + filtered history download. |
| **Mess Incharge / Operator** | Signs in on a counter device. Runs the tap screen + Vendor Dashboard for assigned counters. System decides approve/reject; operator visually confirms the photo. No override. Identity stamped on each tap. |
| **Accountant** | Recharge; card replace/activate/deactivate; scoped reports + balance report. |
| **Management** | Dashboard, cards, recharge, reports (read-heavy). |
| **Admin** | Granular RBAC — grants permissions per module × action. |
| **Super Admin** | Everything incl. categories/meals/rates/vendor-rates/counters, roles & permissions, settings. |

**RBAC model (production generalization of the mock's matrix):** permissions are strings
`module.action` (e.g. `recharge.create`, `cards.replace`, `users.view`). The mock's
`screen × {view/add/edit/delete}` maps onto `module.{view|create|edit|delete}`. Roles bundle
permissions; a staff account has one or more roles; every server action/route checks the
required permission; Super Admin bypasses. Roles/permissions seeded but editable by Super Admin.

> **Decision to carry over:** keep the mock's editable **role × screen × action** grid as the
> admin-facing UI; back it with the `module.action` permission strings server-side. Keep
> **mobile-number login** (it matches the mock and the on-prem usage) — email becomes optional.

Permission catalog (initial):
```
dashboard.view  vendorDashboard.view
users.view|create|edit|delete|import
cards.view|replace|activate|deactivate
recharge.view|create|edit|delete|import
counter.operate
categories.manage  meals.manage  rates.manage  vendorRates.manage  counters.manage
reports.view
settings.manage  roles.manage  staff.manage  accessControl.manage
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
  cardExpiryDate  DateTime?                            // user-level validity; past this date wallet+coupons are zeroed (see §6)
  validityExpired Boolean @default(false)              // set when expiry claw-back has run
  walletBalance   Decimal @default(0) @db.Decimal(12,2)  // money; reconcilable from ledger
  // Note: the mock also stores `empNo` (employee/student no.) and the current `rfid` directly on
  // the cardholder, and a tap matches by rfid OR id OR empNo. Production splits the card into
  // RfidCard (below) but keeps `identifier`/`empNo` as alternate tap-lookup keys.
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
// Rate carries BOTH the charged price (sell, to cardholder) and the vendor price (cost, paid to
// the caterer). Dashboard/reports compute Profit/Loss = price - vendorPrice. Mirrors the mock's
// `state.rates` + `state.vendorRates` (vendorPrice defaults to price when unset).
model Rate    { mealId String categoryId String price Decimal @db.Decimal(12,2) vendorPrice Decimal @db.Decimal(12,2) @@id([mealId, categoryId]) }
model Counter { id String @id @default(cuid()) name String location String? status Status @default(ACTIVE) operators CounterOperator[] }
model CounterOperator { counterId String staffId String @@id([counterId, staffId]) }

// ---- Per-category consumption config (mock's "System Settings" / categorySettings) ----
// Each category has ONE active config that decides how taps are resolved for its cardholders.
model CategorySetting {
  id                 String  @id @default(cuid())
  categoryId         String
  model              CatModel @default(WALLET)   // WALLET (deduct money) | COUPON (deduct count)
  duplicateWindow    Int      @default(0)        // seconds; 0 = no duplicate-tap guard
  restrictMealSession Boolean @default(false)    // true = once per meal session per day
  status             Status   @default(ACTIVE)   // only the ACTIVE row applies; activating one deactivates others for the category
  @@index([categoryId])
}
enum CatModel { WALLET COUPON }

// ---- Money: recharges (grants) + transactions (taps) ----
model Recharge {
  id               String   @id @default(cuid())
  cardholderId     String
  amount           Decimal  @default(0) @db.Decimal(12,2)   // money credited to wallet
  // Mock grants the SAME coupon count to one OR MORE meals in a single recharge (mealIds[] +
  // couponCount each). Model coupon grants as child rows so each meal tracks its own remaining.
  coupons          RechargeCoupon[]
  validTill        DateTime?
  remainingAmount  Decimal  @default(0) @db.Decimal(12,2)   // unspent money from THIS recharge (FIFO consumed on taps)
  expired          Boolean  @default(false)
  remarks          String?
  operatorId       String?                                   // staff who recharged
  createdAt        DateTime @default(now())
  editedAt         DateTime?
  @@index([cardholderId])
}
model RechargeCoupon {                // one meal's coupon grant within a recharge
  rechargeId       String
  mealId           String
  count            Int      @default(0)   // granted
  remaining        Int      @default(0)   // unspent from this grant
  @@id([rechargeId, mealId])
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
  amount        Decimal  @default(0) @db.Decimal(12,2)  // money charged / sale (0 if coupon)
  vendorAmount  Decimal  @default(0) @db.Decimal(12,2)  // vendor cost snapshot → P/L = amount - vendorAmount
  paidBy        String?                      // WALLET | COUPON | null
  status        TxStatus                     // APPROVED | REJECTED | BLOCKED | QUEUED
  reason        String?                      // human reason: "Approved", "Card blocked", "Insufficient wallet", "Meal not recharged", "Already utilized", "Session used", "Validity expired", "No meal window", "Unknown card", "Offline queued"
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

## 6. Consumption / money model (this is how the mock works — port it exactly)

**The resolution model is PER-CATEGORY, not global.** Each category has one active
`CategorySetting` whose `models` enables **WALLET**, **COUPON**, or **both** (multi-select). When
both are enabled the resolution is **coupon-first, then wallet fallback**; with a single model it
behaves as that model only. The same setting also carries that category's `duplicateWindow`
(seconds) and `restrictMealSession` (once-per-meal-session) flags.

Both balances always exist on every cardholder (wallet money + per-meal coupon counts) because a
recharge can credit both; the *consumption* path uses whichever enabled model can pay, trying
coupon before wallet.

### 6.1 Tap resolution — exact order (port of `consumeRFID`)

Run inside one DB transaction, in this order; first failing check wins:

1. Run expiry sweeps first: `expireRecharges()` (recharge `validTill`) and
   `expireUserValidities()` (cardholder `cardExpiryDate`).
2. **Resolve cardholder** by `rfid`, else by `id`, else by `empNo` (case-insensitive).
3. **Offline?** → enqueue `{cardUid, counterId, clientTxId, at}`, status `QUEUED`, display
   "OFFLINE QUEUED". (Server is idempotent on `clientTxId` at sync.)
4. **Unknown card** → `REJECTED` "UNKNOWN CARD".
5. **Blocked** (`status = BLOCKED`) → `BLOCKED` "CARD BLOCKED".
6. **Not active** (any non-active status) → `REJECTED` "USER INACTIVE".
7. **Validity expired** (`cardExpiryDate` past) → zero wallet+coupons, `BLOCKED` "VALIDITY EXPIRED".
8. **No active meal window** now (`Meal.start..end`, overnight aware) → `REJECTED` "NO MEAL WINDOW".
9. **Duplicate within window** (category `duplicateWindow` s, same meal, approved) → `BLOCKED` "ALREADY UTILIZED".
10. **Once-per-session** (category `restrictMealSession`, an approved tap already this meal session today) → `BLOCKED` "SESSION USED".
11. Compute `amount = price(category, meal)` and `vendorAmount = vendorPrice(category, meal)`.
12. Resolve payment by the category's enabled `models`, **coupon first then wallet**. Try each
    enabled model in that order; the first that can pay wins. If none can pay, reject with the
    reason from the last attempted model.
    - **COUPON (if enabled):** if the cardholder has any active recharge but
      `availableRechargeCoupons(meal) < 1` → fails "MEAL NOT RECHARGED" (earmark guard, §6.2);
      else if coupon balance for that meal `< 1` → fails "INSUFFICIENT COUPON"; else decrement the
      meal's coupon balance by 1 **and** one active recharge's remaining coupon for that meal.
      `paidBy = COUPON`, `amount = 0`. **Done.**
    - **WALLET (if enabled and coupon didn't pay):** if the cardholder has any active recharge but
      `availableRechargeAmount(meal) < amount` → fails "MEAL NOT RECHARGED"; else if
      `wallet < amount` → fails "INSUFFICIENT BALANCE"; else `wallet -= amount` **and** FIFO-consume
      `amount` from active recharges' remaining. `paidBy = WALLET`. **Done.**
14. On success: write `APPROVED` transaction (with `amount`, `vendorAmount`, snapshots),
    success **beep** + **voice "Accepted"** (rejections say "Rejected"). Always show the
    cardholder photo/name/category + balances on the result screen.

### 6.2 Recharge earmarking (subtle but important)

A recharge can be **wallet-only**, **coupon-only** (one or more meals), or both. Each recharge
optionally restricts which meals it covers (`RechargeCoupon.mealId`s) and carries a `validTill`.
When a cardholder has **any active recharge**, taps are constrained to what those recharges
cover: if no active recharge covers the current meal (coupons) or has enough remaining money
(wallet), the tap is rejected with **"MEAL NOT RECHARGED"** — even if the raw wallet/coupon
balance looks sufficient. This makes recharges behave as earmarked grants, not just top-ups.

### 6.3 Recharge apply / reverse / expiry (port these functions)

- **Apply** (`applyRecharge`): `wallet += amount`; for each selected meal `coupons[meal] += count`;
  set `remainingAmount = amount`, per-meal `remaining = count`; stamp `afterWallet`; if `validTill`
  set, push it to the cardholder's `cardExpiryDate`.
- **Edit** (`reverseRecharge` then re-apply): reverse the *remaining* (unspent) portion of the old
  recharge first, then apply the new values. Never mutate already-consumed amounts.
- **Delete**: reverse the remaining portion, then remove the row.
- **Recharge expiry** (`expireRecharges`): when `validTill` passes, claw back this recharge's
  remaining money + coupons from the cardholder and mark `expired`.
- **User-validity expiry** (`expireUserValidities`): when `cardExpiryDate` passes, zero the
  cardholder's entire wallet + coupons and set `validityExpired`.

> In production these become an append-only ledger (`wallet_transactions` / `coupon_transactions`)
> with the cached balances reconcilable from it; expiry/reversal write offsetting ledger rows
> rather than mutating balances. The *business outcome* above must match the mock exactly.

---

## 7. Module specs (mapped from the mock)

| # | Module | Source tab | Production notes |
|---|---|---|---|
| 1 | **Auth & RBAC** | Login + Access Control | Mobile+password login, change-password, sessions; role × screen × {view/add/edit/delete} grid backed by `module.action` guards; seed Super Admin |
| 2 | **Master data** | Configurations | Meals (timings) + **dual rate matrix (charge + vendor)** per category, **per-category settings** (model/duplicate-window/session-restriction/status), counters + operator assignment, portal employees, categories (+identifier config) |
| 3 | **Cardholders** | Users | CRUD, search (id/rfid/empNo/mobile/name/email), status block/unblock, validity/expiry, CSV bulk import + sample, CSV export |
| 4 | **RFID cards** | Replace Card | Replace (with history + reason), activate/deactivate, expiry. (Mock keeps rfid on user + a `cardHistory` log) |
| 5 | **Recharge & ledger** | Recharge | Wallet top-up + **multi-meal coupon grants**, validity, **edit/delete with remaining-portion reversal**, earmarking, receipt/history, CSV import with per-row failure report |
| 6 | **RFID Counter** | RFID Counter | Operator login on device, server-side tap engine (§6.1), photo verification UI, **beep + voice**, fullscreen mode, recent taps |
| 7 | **Offline/PWA** | (offline queue) | Service worker + IndexedDB queue + idempotent sync + sync button in Reports |
| 8 | **Dashboard** | Dashboard | KPIs (users, consumption count+sale, collections, **vendor cost, profit/loss**), usage by category/meal/counter-location with sale/vendor/P&L, date-range picker |
| 9 | **Vendor Dashboard** | Vendor Dashboard | Operator-facing: **vendor revenue** (coupons × vendor rate) per meal and per counter, scoped to the operator's assigned counters, date-range picker |
| 10 | **Reports** | Reports | Consumption report (paginated, rich filters incl. P/L), balance report (wallet + per-meal coupons + totals), audit log, CSV exports |
| 11 | **Schema/API docs** | Schema/API | In-app blueprint of tables + REST endpoints (already in mock; keep as living dev reference) |
| 12 | **Self-service** | (new) | Public page: balance + filtered history download |
| 13 | **Branches & org** | (new) | Multi-branch: branches, departments, branch-scoped staff/users/counters/rates |
| 14 | **Vendor settlement** | (new) | Vendors + period settlements (meal counts × vendor rate → payable amount) — distinct from the Vendor Dashboard view above |

---

## 8. RFID Counter & offline design (the critical path)

- **Operator login**: counter device authenticates a staff account; only their assigned active
  counters are selectable. Operator id stamped on every tap.
- **Tap capture**: keydown listener on a focused input; reader emits digits + Enter. Heuristic
  to distinguish fast reader bursts from manual typing (inter-key timing).
- **Online tap**: POST `/api/counter/tap` `{ cardUid, counterId, clientTxId }` → server runs the
  consumption engine (§6.1) in a transaction → returns APPROVED/REJECTED/BLOCKED + reason +
  cardholder photo, name, category, balances. UI shows the big colored result, plays a **beep**
  (880 Hz approved / 220 Hz rejected) and **voice** ("Accepted"/"Rejected" via speechSynthesis).
- **Counter UX from the mock to keep**: full-screen/maximize toggle (Esc exits), counter-device
  selector showing the assigned owner/operator, current-meal pill, "Recent Consumption" table,
  and Enter-to-tap on the input.
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
POST /api/auth/[...nextauth]          staff login (mobile + password)
POST /api/counter/tap                 process a tap (idempotent, runs §6.1 engine)
POST /api/counter/sync                bulk replay offline queue
GET  /api/cardholders?q=              search (id/rfid/empNo/mobile/name/email)
GET  /api/dashboard?from=&to=         KPIs + usage breakdowns (sale/vendor/P&L)
GET  /api/vendor-dashboard?from=&to=  vendor revenue scoped to caller's assigned counters
...                                    CRUD per module via Server Actions where possible
                                       (users[+import], cards, recharges[+import], meals,
                                        rates+vendorRates, category-settings, counters,
                                        portal-employees/staff, access-control, reports)
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

| Phase | Deliverable | Mock parity | Status |
|---|---|---|---|
| **0. Setup** | Next.js + TS + Tailwind + Prisma + Postgres, env, base layout (theme already finalized — just wire it), CI | — | ✅ Done |
| **1. Auth & RBAC** | Mobile+password login, change-password, role×screen×action grid + guards, seed Super Admin | Login + Access Control | ✅ Done |
| **2. Master data** | Categories (+identifier), meals, **dual rates (charge+vendor)**, **per-category settings**, counters, operators, portal employees | Configurations | ✅ Done |
| **3. Cardholders & cards** | CRUD, import/export, block, validity/expiry, replace + history | Users + Replace Card | ✅ Done |
| **4. Recharge & ledger** | Wallet + multi-meal coupon grants, validity/expiry, edit/delete reversal, earmarking, import w/ failure report, receipts | Recharge | ✅ Done |
| **5. RFID Counter** | Operator login, server tap engine (§6.1), verification UI, per-category rules, beep + voice, fullscreen | RFID Counter | ✅ Done |
| **6. Offline/PWA** | Service worker, IndexedDB queue, idempotent sync, sync report | Offline queue | ✅ Done |
| **7. Dashboards & reports** | Dashboard (incl. vendor cost + P/L), **Vendor Dashboard**, consumption/balance reports, date range, CSV, audit log | Dashboard + Vendor Dashboard + Reports | ◻ Next |
| **8. Self-service** | Public balance + filtered history download | (new) | ◻ |
| **9. Vendor settlement** | Vendors + period settlements (meal counts × vendor rate → payable) | (new) | ◻ |
| **10. Hardening & deploy** | Validation, rate limits, tests, audit completeness, deployment | — | ◻ |

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
6. Seed script (mirror the mock's seed data):
   - Super Admin (mobile `9281122104`) + portal employees (Admin / Mess Incharge / Accountant / Management) with the default access-control grid.
   - Categories: Student, Employee, Contractor, Guest, Visitor.
   - Meals + windows: Breakfast 07:00–11:00, Lunch 11:30–15:00, Snacks 16:00–18:00, Dinner 19:00–22:00.
   - **Dual rate matrix** (charge + vendor) per meal × category (use the mock's numbers in `seedState()`).
   - **CategorySetting**: Student → COUPON, duplicateWindow 120s, restrictMealSession on, active; others default WALLET.
   - Counters (Counter 1 Main / Counter 2 Annex / Counter 3 Block A) + operator assignments.
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
| Coupon = count vs money; tap priority | Phase 4–5 | **Resolved:** per-category `models` enables WALLET, COUPON, or **both**; when both, resolution is **coupon-first then wallet**. Coupon = meal count (price-independent). See §6. |
| Recharge earmarking ("MEAL NOT RECHARGED") | Phase 4–5 | **Resolved by mock:** active recharges constrain consumable meals/amounts. Confirm this is desired in prod (it is implemented). See §6.2. |
| Dual rates + Profit/Loss reporting | Phase 2,7 | **Resolved by mock:** charge rate + vendor rate per meal×category; P/L surfaced on dashboard/reports. |
| Login handle: mobile vs email | Phase 1 | **Resolved by mock:** mobile number + password. Email optional. |
| Self-service second field (privacy) | Phase 8 | Pending — pure public lookup vs ID + mobile/DOB |
| Deployment: cloud vs on-premise LAN | Phase 9 | Parked (affects offline aggressiveness) |
| RFID hardware specifics (reader model, prefix/suffix) | Phase 5 | Parked |
| Notifications (SMS/email on low balance/recharge) | v2 | Out of scope for v1 (a `notifications` table is sketched) |
| Online recharge / payment gateway | v2 | Out of scope for v1 (Accounts-counter only) |

---

## 14. Non-goals (v1)

- No online/self-service recharge or payment gateway (Accounts-counter recharge only).
- No cardholder login/passwords (public lookup only).
- No native mobile app (PWA only).

> Note: **multi-branch IS in v1** (branches within one institution — not multi-tenant SaaS).
> **Vendor settlement IS in v1.**
```
