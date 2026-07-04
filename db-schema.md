# RFID Coupon Management System — Database Schema

> Status: living document. Created 2026-06-08 from the reviewed MySQL 8.0 DDL proposal.
> Companion to `plan.md`. This is the **authoritative schema** (base DDL + corrections + additions).
>
> **⚠️ Wallet retired (coupon-only) — 2026-07-02.** The app no longer uses the money-balance wallet.
> The `wallets` and `wallet_transactions` tables and `recharges.remaining_amount` are **kept for
> back-compat but dormant** — no code reads or writes them. `redemptions.paid_by` is now `coupon`
> for counter taps and `NULL` for food-request deliveries (never `wallet`). Balances, ledgers, and
> reconciliation described below apply to **coupons**; the wallet sections are historical.

---

## 0. Stack note (READ FIRST) — DECIDED

**Database = PostgreSQL. ORM = Prisma (source of truth; managed migrations).**
The DDL below is written in MySQL 8.0 (the form it was proposed in) and kept as the **annotated
conceptual reference**. The authoritative artifact will be `prisma/schema.prisma`, which targets
**PostgreSQL**. Also decided: **multi-branch is IN**, **vendor settlement is IN v1**.

Why Postgres (long-term): native **partial unique indexes** enforce the hard rules in-DB with no
triggers ("one active card per user", "one approved tap per user per meal session"); stronger
`CHECK`/enum constraints; MVCC concurrency for simultaneous taps across branches; `JSONB`;
`timestamptz` (no 2038 limit). The MySQL DDL needed a trigger workaround for the active-card rule
— Postgres removes that fragility.

**MySQL → PostgreSQL translation deltas (applied when porting to Prisma):**
- `BIGINT UNSIGNED AUTO_INCREMENT` → `BIGINT GENERATED ALWAYS AS IDENTITY` (no `UNSIGNED`).
- `TINYINT(1)` → `BOOLEAN`; `JSON` → `JSONB`; `ENUM(...)` → Postgres enum (Prisma `enum`).
- `ON UPDATE CURRENT_TIMESTAMP` → Prisma `@updatedAt`.
- "one active card per user" / once-per-session → `CREATE UNIQUE INDEX ... WHERE ...` (no trigger).
- `settings.key` reserved-word backticks → real column name `setting_key`.
- Partitioning: not in v1; use Postgres declarative partitioning later if ever needed.

Conventions for the whole schema: **FK enforced, money = `DECIMAL(12,2)`, soft deletes via
`deleted_at`, idempotency via `client_uuid`, append-only ledgers, audit via `audit_log`.**

---

## 1. Review verdict on the provided DDL

| Severity | Finding | Resolution |
|---|---|---|
| 🔴 Fatal | `redemptions` partitioning fails — InnoDB requires the partition column in every unique key; PK=`id`, unique=`client_uuid` don't include `redeemed_at`. | Partitioning **removed for v1** (scale doesn't need it). Composite-key fix documented in §8. |
| 🟠 Gap | No `categories` (cardholder type) + per-category identifier config. | **Added** `categories`; `users.category_id`. |
| 🟠 Gap | `meal_rates` priced by branch only — mock prices **meal × category**. | **Added** `category_id` to `meal_rates`. |
| 🟠 Gap | `meal_types` had no time windows (counter needs "active meal now"). | **Added** `start_time`, `end_time`. |
| 🟠 Gap | `wallets.meal_balance` is a single bucket — mock coupons are per-meal. | **Replaced** with `coupon_balances` + `coupon_transactions`. |
| 🟠 Gap | No card replace/status history. | **Added** `card_events`. |
| 🟠 Gap | No counter↔operator assignment. | **Added** `counter_operators`. |
| 🟠 Gap | No `settings` table (duplicate window, once-per-session, strategy). | **Added** `settings`. |
| 🟡 Minor | Recharge had no validity/expiry (mock claws back). | **Added** `valid_from/valid_till/remaining_*` (provisional). |
| 🟡 Minor | `redemptions` didn't record which balance paid. | **Added** `paid_by`. |
| 🟡 Minor | `TIMESTAMP` 2038 limit on far-future fields. | **Use `DATETIME`** for `expires_at`, `expires_on`. |
| ✅ Keep | Multi-branch, recharge_plans, payment_modes, reversals, vendors/settlements, double-entry ledger, optimistic locking, soft deletes, audit before/after. | Retained. |

**Naming convention (from the DDL, kept):** `users` = **cardholders** (no login); `app_users` =
**staff** (login + RBAC). This honors the cardholder/staff split from `plan.md`.

---

## 2. Conventions

- **Branch scoping:** `app_users.branch_id NULL` = all-branch (Super Admin). Non-null = scoped to
  one branch. Queries filter by branch unless the actor is all-branch.
- **Identifiers / idempotency:** every offline-originating write (`recharges`, `redemptions`,
  `offline_queue`) carries a `client_uuid` with a UNIQUE key → safe retry / no double-post.
- **Money:** `DECIMAL(12,2)`; never float. `CHECK (... >= 0)` enforced (MySQL 8.0.16+).
- **Ledgers are append-only:** `wallet_transactions` / `coupon_transactions` rows are never
  updated; corrections are new `reversal`/`adjustment` rows. `wallets`/`coupon_balances` are the
  cached current values (reconcilable from the ledger).
- **Optimistic locking:** `wallets.version` / `coupon_balances.version` incremented on every
  balance mutation inside a transaction; concurrent taps retry on version mismatch.
- **Soft deletes:** `deleted_at` on master tables; ledgers/redemptions are never deleted (reverse
  instead).

---

## 3. Identity, access & org

### branches
Physical campus / location. Root of branch scoping.
```sql
CREATE TABLE branches (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(30)  NOT NULL,
  name       VARCHAR(150) NOT NULL,
  address    VARCHAR(255) NULL,
  status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,   -- app_users.id (no FK: avoids circular dep, set in app)
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  UNIQUE KEY uq_branches_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### roles / permissions / role_permissions
RBAC. Permissions are `module.action` strings (`recharge.create`, `cards.replace`, …). Super
Admin role holds all. Editable by Super Admin (`roles.manage`).
```sql
CREATE TABLE roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL, description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL, module VARCHAR(60) NOT NULL, description VARCHAR(255) NULL,
  UNIQUE KEY uq_perm_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id BIGINT UNSIGNED NOT NULL, permission_id BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_role_perm (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
> **Note:** `app_users` uses a single `role_id`. If multi-role per staff is ever needed, add a
> `app_user_roles(app_user_id, role_id)` join and drop `app_users.role_id`. Single role is fine
> for v1.

### app_users (STAFF — login)
```sql
CREATE TABLE app_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL, email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NULL,                 -- NULL = all branches (Super Admin)
  cardholder_user_id BIGINT UNSIGNED NULL,        -- 🆕 optional link to this login's OWN cardholder (self-service food requests §9.5); staff≠cardholders still holds
  status ENUM('active','disabled','locked') NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP NULL,
  failed_logins TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  UNIQUE KEY uq_appuser_username (username),
  UNIQUE KEY uq_appuser_email (email),
  CONSTRAINT fk_appuser_role   FOREIGN KEY (role_id)   REFERENCES roles(id),
  CONSTRAINT fk_appuser_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_appuser_cardholder FOREIGN KEY (cardholder_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### departments
Org unit within a branch (informational). Distinct from `categories`.
```sql
CREATE TABLE departments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NOT NULL, name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dept (branch_id, name),
  CONSTRAINT fk_dept_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### categories  🆕 (ADDED — core)
Cardholder type. Drives **per-category pricing** and **per-category identifier rules**. This is
what `users.code` must satisfy (e.g. Student → "Admission No.", Employee → "Employee ID").
```sql
CREATE TABLE categories (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code               VARCHAR(30)  NOT NULL,
  name               VARCHAR(80)  NOT NULL,        -- Student, Employee, Contractor, Guest...
  identifier_label   VARCHAR(60)  NOT NULL DEFAULT 'ID',  -- "Admission No." / "Employee ID"
  identifier_regex   VARCHAR(120) NULL,            -- optional format validation
  identifier_required TINYINT(1)  NOT NULL DEFAULT 1,
  identifier_unique  TINYINT(1)   NOT NULL DEFAULT 1,
  status             ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_category_code (code),
  UNIQUE KEY uq_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 4. Counters & devices

### counters / counter_operators 🆕
```sql
CREATE TABLE counters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL, name VARCHAR(120) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  UNIQUE KEY uq_counter (branch_id, code),
  CONSTRAINT fk_counter_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Which staff may sign in / operate which counter (mock's assignedUserIds).
CREATE TABLE counter_operators (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  counter_id  BIGINT UNSIGNED NOT NULL,
  app_user_id BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_counter_oper (counter_id, app_user_id),
  CONSTRAINT fk_co_counter FOREIGN KEY (counter_id)  REFERENCES counters(id) ON DELETE CASCADE,
  CONSTRAINT fk_co_oper    FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 5. Cardholders & cards

### users (CARDHOLDERS) — 🔧 added `category_id`, `photo_url`
```sql
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(40)  NOT NULL,    -- the category identifier (roll/admission/emp no)
  full_name     VARCHAR(150) NOT NULL,
  phone         VARCHAR(20)  NULL,
  email         VARCHAR(150) NULL,
  category_id   BIGINT UNSIGNED NOT NULL, -- 🆕
  department_id BIGINT UNSIGNED NULL,
  branch_id     BIGINT UNSIGNED NOT NULL,
  photo_url     VARCHAR(255) NULL,        -- 🆕 (counter verification)
  kyc_ref       VARCHAR(80)  NULL,
  status        ENUM('active','suspended','inactive') NOT NULL DEFAULT 'active',
  created_by    BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  UNIQUE KEY uq_users_code (code),
  KEY idx_users_branch (branch_id),
  KEY idx_users_category (category_id),
  KEY idx_users_phone (phone),
  CONSTRAINT fk_user_cat    FOREIGN KEY (category_id)   REFERENCES categories(id),
  CONSTRAINT fk_user_dept   FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_user_branch FOREIGN KEY (branch_id)     REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
> `code` is globally unique and is the **self-service public-lookup handle**. If per-category
> uniqueness (not global) is ever required, switch `uq_users_code` to `(category_id, code)`.

### rfid_cards — 🔧 added `expires_on`
```sql
CREATE TABLE rfid_cards (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  card_uid VARCHAR(64) NOT NULL,            -- value the USB reader emits
  user_id  BIGINT UNSIGNED NOT NULL,
  status   ENUM('active','blocked','lost','retired') NOT NULL DEFAULT 'active',
  issued_at  TIMESTAMP NULL,
  expires_on DATETIME NULL,                 -- 🆕
  blocked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_card_uid (card_uid),
  KEY idx_card_user (user_id),
  CONSTRAINT fk_card_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
> **One active card per user:** MySQL has no partial unique index. Enforce in the service layer
> AND with a `BEFORE INSERT/UPDATE` trigger, OR add a generated column
> `active_uid VARCHAR(64) AS (IF(status='active', CONCAT('U',user_id), NULL)) STORED` with
> `UNIQUE(active_uid)`. (On PostgreSQL: `CREATE UNIQUE INDEX ... WHERE status='active'`.)

### card_events 🆕 (replace / status history — mock's cardHistory)
```sql
CREATE TABLE card_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  card_id     BIGINT UNSIGNED NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  type        ENUM('issue','replace','activate','deactivate','lost','retire') NOT NULL,
  old_uid     VARCHAR(64) NULL,
  new_uid     VARCHAR(64) NULL,
  reason      VARCHAR(255) NULL,
  app_user_id BIGINT UNSIGNED NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cardevt_user (user_id),
  KEY idx_cardevt_card (card_id),
  CONSTRAINT fk_ce_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_ce_oper FOREIGN KEY (app_user_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 6. Balances (cached) — money + coupons

### wallets — 🔧 removed single `meal_balance` (per-meal moved to `coupon_balances`)
```sql
CREATE TABLE wallets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  balance_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  version INT UNSIGNED NOT NULL DEFAULT 0,             -- optimistic lock
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet_user (user_id),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT chk_wallet_nonneg CHECK (balance_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### coupon_balances 🆕 (per-meal coupon counts — PROVISIONAL, mock parity)
```sql
CREATE TABLE coupon_balances (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  meal_type_id BIGINT UNSIGNED NOT NULL,
  count        INT NOT NULL DEFAULT 0,
  version      INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupon_user_meal (user_id, meal_type_id),
  CONSTRAINT fk_cb_user FOREIGN KEY (user_id)      REFERENCES users(id),
  CONSTRAINT fk_cb_meal FOREIGN KEY (meal_type_id) REFERENCES meal_types(id),
  CONSTRAINT chk_coupon_nonneg CHECK (count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
> If the final coupon decision is "coupons are just earmarked money", drop `coupon_balances` /
> `coupon_transactions` and represent coupons as earmarked `recharges` against the wallet.

> **Materialised grid.** Every non-deleted cardholder holds one `count=0` row per **active**
> meal, created with the user (single create, CSV import, seed — via
> `services/coupon-balance.ts`) and backfilled by migration
> `20260704090000_backfill_coupon_balances`. These rows are behaviour-neutral (tap engine and
> reports already read a missing row as `0`; `applyRecharge` upserts on grant) — they just remove
> the "missing record" gap. Existing rows are never zeroed; recharges still mutate `count` normally.

---

## 7. Catalog & pricing

### meal_types — 🔧 added time windows
```sql
CREATE TABLE meal_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL, name VARCHAR(80) NOT NULL,
  start_time TIME NOT NULL DEFAULT '00:00:00',   -- 🆕 active-meal window
  end_time   TIME NOT NULL DEFAULT '00:00:00',   -- 🆕 (supports overnight via app logic)
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_meal_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### meal_rates — 🔧 added `category_id`
Rate = **meal × category × branch**, time-versioned via `valid_from/valid_to`.
```sql
CREATE TABLE meal_rates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  meal_type_id BIGINT UNSIGNED NOT NULL,
  category_id  BIGINT UNSIGNED NOT NULL,   -- 🆕
  branch_id    BIGINT UNSIGNED NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to   DATE NULL,                     -- NULL = current
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rate_lookup (branch_id, meal_type_id, category_id, valid_from),
  CONSTRAINT fk_rate_meal   FOREIGN KEY (meal_type_id) REFERENCES meal_types(id),
  CONSTRAINT fk_rate_cat    FOREIGN KEY (category_id)  REFERENCES categories(id),
  CONSTRAINT fk_rate_branch FOREIGN KEY (branch_id)    REFERENCES branches(id),
  CONSTRAINT chk_rate_nonneg CHECK (rate >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
> Current-rate lookup: row matching (branch, meal, category) with
> `valid_from <= CURDATE() AND (valid_to IS NULL OR valid_to >= CURDATE())`, latest `valid_from`.

### recharge_plans / payment_modes (kept)
```sql
CREATE TABLE recharge_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  bonus  DECIMAL(10,2) NOT NULL DEFAULT 0,
  meal_count INT NOT NULL DEFAULT 0,
  meal_type_id BIGINT UNSIGNED NULL,        -- 🆕 if plan grants a specific meal's coupons
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_plan_meal FOREIGN KEY (meal_type_id) REFERENCES meal_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payment_modes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL, name VARCHAR(60) NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_paymode_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 8. Money movements (ledgers)

### recharges — 🔧 added validity + remaining (provisional) + meal_type for coupon grants
```sql
CREATE TABLE recharges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_uuid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  card_id BIGINT UNSIGNED NULL,
  plan_id BIGINT UNSIGNED NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,            -- money → wallet
  meal_type_id BIGINT UNSIGNED NULL,                 -- 🆕 set → coupon grant for this meal
  meal_credits INT NOT NULL DEFAULT 0,               -- coupon count granted
  valid_from DATE NULL,                              -- 🆕 validity (provisional)
  valid_till DATE NULL,                              -- 🆕
  remaining_amount DECIMAL(10,2) NOT NULL DEFAULT 0, -- 🆕 FIFO/expiry support
  remaining_meal_credits INT NOT NULL DEFAULT 0,     -- 🆕
  payment_mode_id BIGINT UNSIGNED NOT NULL,
  counter_id BIGINT UNSIGNED NULL,
  app_user_id BIGINT UNSIGNED NOT NULL,              -- operator
  status ENUM('posted','reversed','expired') NOT NULL DEFAULT 'posted',  -- 🔧 +expired
  recharged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_recharge_uuid (client_uuid),
  KEY idx_recharge_user_time (user_id, recharged_at),
  CONSTRAINT fk_rc_user    FOREIGN KEY (user_id)         REFERENCES users(id),
  CONSTRAINT fk_rc_card    FOREIGN KEY (card_id)         REFERENCES rfid_cards(id),
  CONSTRAINT fk_rc_plan    FOREIGN KEY (plan_id)         REFERENCES recharge_plans(id),
  CONSTRAINT fk_rc_meal    FOREIGN KEY (meal_type_id)    REFERENCES meal_types(id),
  CONSTRAINT fk_rc_paymode FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id),
  CONSTRAINT fk_rc_counter FOREIGN KEY (counter_id)      REFERENCES counters(id),
  CONSTRAINT fk_rc_oper    FOREIGN KEY (app_user_id)     REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### redemptions (TAPS) — 🔧 partitioning removed, added `paid_by`
```sql
CREATE TABLE redemptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_uuid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  card_id BIGINT UNSIGNED NOT NULL,
  meal_type_id BIGINT UNSIGNED NOT NULL,
  counter_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,                  -- 🆕 snapshot
  paid_by ENUM('wallet','coupon') NULL,              -- 🆕 which balance paid
  rate_applied DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,                      -- 0 when paid_by='coupon'
  app_user_id BIGINT UNSIGNED NOT NULL,              -- operator
  status ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP NULL,                           -- set when an offline tap is synced
  UNIQUE KEY uq_redeem_uuid (client_uuid),
  KEY idx_redeem_user_time (user_id, redeemed_at),
  KEY idx_redeem_counter_time (counter_id, redeemed_at),
  KEY idx_redeem_meal_time (meal_type_id, redeemed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Partitioning intentionally omitted for v1 (≈ <3M rows/yr).
-- To enable later: PK -> (id, redeemed_at); uq_redeem_uuid -> (client_uuid, redeemed_at),
-- because InnoDB requires every unique key to contain the partition column. Then:
--   PARTITION BY RANGE (TO_DAYS(redeemed_at)) ( ... );
```

### wallet_transactions (append-only money ledger, kept)
```sql
CREATE TABLE wallet_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  wallet_id BIGINT UNSIGNED NOT NULL,
  user_id   BIGINT UNSIGNED NOT NULL,
  txn_type  ENUM('CR','DR') NOT NULL,
  source_table ENUM('recharge','redemption','reversal','adjustment','expiry') NOT NULL, -- 🔧 +expiry
  source_id BIGINT UNSIGNED NOT NULL,
  amount    DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  reference VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wt_wallet_time (wallet_id, created_at),
  KEY idx_wt_user_time (user_id, created_at),
  CONSTRAINT fk_wt_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  CONSTRAINT fk_wt_user   FOREIGN KEY (user_id)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### coupon_transactions 🆕 (append-only coupon ledger — PROVISIONAL)
```sql
CREATE TABLE coupon_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  meal_type_id BIGINT UNSIGNED NOT NULL,
  txn_type ENUM('CR','DR') NOT NULL,
  source_table ENUM('recharge','redemption','reversal','adjustment','expiry') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  count INT NOT NULL,
  balance_after INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ct_user_time (user_id, created_at),
  CONSTRAINT fk_ct_user FOREIGN KEY (user_id)      REFERENCES users(id),
  CONSTRAINT fk_ct_meal FOREIGN KEY (meal_type_id) REFERENCES meal_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### reversals (maker-checker, kept)
```sql
CREATE TABLE reversals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_table ENUM('recharge','redemption') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(255) NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rev_source (source_table, source_id),
  CONSTRAINT fk_rev_req FOREIGN KEY (requested_by) REFERENCES app_users(id),
  CONSTRAINT fk_rev_app FOREIGN KEY (approved_by)  REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 9. Vendor settlement (kept — optional module)

```sql
CREATE TABLE vendors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL, name VARCHAR(150) NOT NULL, gstin VARCHAR(20) NULL,
  app_user_id BIGINT UNSIGNED NULL,            -- 🆕 portal login (Vendor role) — food requests §9.5
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_vendor_code (code),
  UNIQUE KEY uq_vendor_app_user (app_user_id),
  CONSTRAINT fk_vendor_app_user FOREIGN KEY (app_user_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendor_settlements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vendor_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  meal_count INT NOT NULL DEFAULT 0,
  gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vs_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_vs_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 9.5 Admin food requests 🆕 (plan.md §15)

Admin raises item requests against a cardholder's RFID account → optional single-step approval →
vendor fulfilment → **RFID-tap-gated delivery** that debits the wallet via the **same `redemptions`
ledger** (so settlement/reports in §9 include them with no query changes). Catalog-only pricing;
wallet-only payment; vendor signs in via `vendors.app_user_id` (role `Vendor`).

**Ledger integration:** a fulfilled request posts one `redemption` **per line** on a seeded
per-branch **"Food Requests" virtual counter** (no operators / no `counter_meals` → never tappable),
with the item's representative `meal_type_id`. This gives each row a serving-counter branch (how
reporting scopes) and a meal (how usage groups) without altering `services/reporting.ts` /
`services/settlement.ts`. `redemptions.food_request_id` (🆕, NULLable) back-references the request.

```sql
-- Catalog: single source of charged price (sale) + vendor price (cost). Prices are
-- snapshotted onto each request line at creation, so catalog edits never restate history.
CREATE TABLE food_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  kind ENUM('beverage','snack','meal','custom') NOT NULL DEFAULT 'meal',
  unit_price DECIMAL(12,2) NOT NULL,           -- charged to the RFID account
  unit_vendor_price DECIMAL(12,2) NOT NULL,    -- paid to the vendor → P/L
  meal_type_id BIGINT UNSIGNED NOT NULL,       -- representative meal (redemption grouping)
  branch_id BIGINT UNSIGNED NULL,              -- NULL = all-branch
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_food_item_code (code),
  KEY idx_food_item_branch (branch_id),
  CONSTRAINT fk_fi_meal FOREIGN KEY (meal_type_id) REFERENCES meal_types(id),
  CONSTRAINT fk_fi_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Request header. Charged user (users) ≠ requesting staff (app_users). Money moves
-- only at delivery; amount/vendor_amount are catalog snapshots taken at creation.
CREATE TABLE food_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,                   -- human ref e.g. FR-000123
  branch_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,            -- RFID account charged
  requested_by_app_user_id BIGINT UNSIGNED NOT NULL,
  vendor_id BIGINT UNSIGNED NULL,
  delivery_location VARCHAR(150) NOT NULL,
  requested_for DATETIME NOT NULL,             -- requested delivery date & time
  purpose VARCHAR(255) NULL,                   -- remarks / purpose
  status ENUM('raised','pending_approval','approved','vendor_accepted',
              'preparing','out_for_delivery','delivered','rejected','cancelled')
         NOT NULL DEFAULT 'raised',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,         -- Σ qty × unit_price (sale)
  vendor_amount DECIMAL(12,2) NOT NULL DEFAULT 0,  -- Σ qty × unit_vendor_price (cost)
  approval_required TINYINT(1) NOT NULL DEFAULT 0, -- snapshot of setting at creation
  approved_by_app_user_id BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  reject_reason VARCHAR(255) NULL,
  fulfilled_client_uuid CHAR(36) NULL,         -- idempotency for the delivery charge
  card_id_used BIGINT UNSIGNED NULL,           -- card tapped at delivery (RFID verification)
  delivered_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fr_code (code),
  UNIQUE KEY uq_fr_fulfilled_uuid (fulfilled_client_uuid),
  KEY idx_fr_branch_status (branch_id, status),
  KEY idx_fr_user (user_id),
  KEY idx_fr_vendor_status (vendor_id, status),
  CONSTRAINT fk_fr_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_fr_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_fr_reqby FOREIGN KEY (requested_by_app_user_id) REFERENCES app_users(id),
  CONSTRAINT fk_fr_approver FOREIGN KEY (approved_by_app_user_id) REFERENCES app_users(id),
  CONSTRAINT fk_fr_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_fr_card FOREIGN KEY (card_id_used) REFERENCES rfid_cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One line per request. Prices snapshotted from the catalog.
CREATE TABLE food_request_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  food_item_id BIGINT UNSIGNED NOT NULL,
  meal_type_id BIGINT UNSIGNED NOT NULL,       -- snapshot from item (redemption grouping)
  description VARCHAR(255) NULL,                -- free text, e.g. a Custom Item's specifics
  qty INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  unit_vendor_price DECIMAL(12,2) NOT NULL,
  KEY idx_fri_request (request_id),
  CONSTRAINT fk_fri_request FOREIGN KEY (request_id) REFERENCES food_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_fri_item FOREIGN KEY (food_item_id) REFERENCES food_items(id),
  CONSTRAINT fk_fri_meal FOREIGN KEY (meal_type_id) REFERENCES meal_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only status history → request timeline + audit trail.
CREATE TABLE food_request_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  note VARCHAR(255) NULL,
  app_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fre_request (request_id),
  CONSTRAINT fk_fre_request FOREIGN KEY (request_id) REFERENCES food_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_fre_user FOREIGN KEY (app_user_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 🆕 redemptions gains: food_request_id BIGINT UNSIGNED NULL  (FK → food_requests.id, ON DELETE SET NULL)
--    set when a row originates from a fulfilled food request; NULL for normal counter taps.
```

> **PG/Prisma deltas:** `from_status`/`to_status` are the native `FoodRequestStatus` enum (not
> VARCHAR); `fulfilled_client_uuid` is `UUID`; booleans are `BOOLEAN`; timestamps `timestamptz`.
> Approval config lives in `settings` under `food_request_approval`
> `{ enabled, autoApproveBelow, approverPermission }` — no dedicated table (single-step in v1).

---

## 10. Ops: offline, sessions, audit, notifications, settings

```sql
CREATE TABLE offline_queue (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(80) NOT NULL,
  client_uuid CHAR(36) NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('pending','synced','failed','duplicate') NOT NULL DEFAULT 'pending',
  synced_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_oq_uuid (client_uuid),
  KEY idx_oq_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sessions (                 -- optional if Auth.js JWT strategy is used
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  ip VARCHAR(45) NULL, user_agent VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,         -- 🔧 DATETIME (2038-safe)
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_token (token_hash),
  KEY idx_session_user (app_user_id),
  CONSTRAINT fk_sess_user FOREIGN KEY (app_user_id) REFERENCES app_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL, entity VARCHAR(60) NOT NULL, entity_id BIGINT UNSIGNED NULL,
  before_json JSON NULL, after_json JSON NULL,
  ip VARCHAR(45) NULL, user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity, entity_id),
  KEY idx_audit_user_time (app_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(40) NOT NULL, audience VARCHAR(60) NOT NULL,
  payload_json JSON NOT NULL, read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settings (                 -- 🆕 system config (mock's Configurations tab)
  `key` VARCHAR(60) PRIMARY KEY,        -- duplicate_window_seconds, prevent_per_meal_session,
  value JSON NOT NULL,                  -- resolution_strategy, currency, ...
  branch_id BIGINT UNSIGNED NULL,       -- NULL = global; set = per-branch override
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 11. Where business rules are enforced

| Rule | Enforced |
|---|---|
| One **active** card per user; one current card | Service + trigger/generated-column (MySQL) · partial unique index (PG) |
| No double-post of an offline tap/recharge | `UNIQUE (client_uuid)` |
| Balance never negative | `CHECK (>= 0)` + service transaction |
| Concurrent taps don't oversell | `wallets.version` / `coupon_balances.version` optimistic lock + retry |
| "Active meal now" | `meal_types.start_time/end_time` (overnight handled in service) |
| Duplicate-tap window / once-per-session | `settings` + service check against recent `redemptions` |
| Correct price | `meal_rates` (branch × meal × category, date-versioned) |
| Recharge edit/delete reverses balance | `reversals` + offsetting ledger rows (never mutate posted rows) |
| Recharge validity expiry claw-back | scheduled job → `expiry` ledger rows + `recharges.status='expired'` |
| Every state change traceable | `audit_log` before/after JSON |

---

## 12. Seed (mirror the mock)

- 1 branch, Super Admin `app_user`, full role/permission set.
- categories: Student, Employee, Contractor, Guest, Visitor (+ identifier labels).
- meal_types: Breakfast 07:00–11:00, Lunch 11:30–15:00, Snacks 16:00–18:00, Dinner 19:00–22:00.
- meal_rates: the mock's price matrix (meal × category) for the branch.
- payment_modes: Cash, Card, UPI, Other.
- counters: Counter 1 (Main), Counter 2 (Annex) + operator assignment.
- settings: `duplicate_window_seconds=120`, `prevent_per_meal_session=true`,
  `resolution_strategy='coupon_first'`, `currency='INR'`.

---

## 13. Open / deferred (sync with plan.md §13)

Resolved 2026-06-08: **DB = PostgreSQL** · **multi-branch = IN** · **vendor settlement = IN v1**.

Resolved 2026-06-18 (food requests, §9.5): **pricing = catalog-only** · **payment = wallet-only** ·
**vendor = staff login + `Vendor` role** · **approval = single configurable step** (in `settings`).
Deferred for that module: multi-level approval hierarchy; coupon-based payment for requests;
notifications (email/SMS/WhatsApp) — pending design changes.

Still open:
- **Coupon = count vs earmarked money** → decides whether `coupon_balances`/`coupon_transactions`
  stay or collapse into wallet-earmarked `recharges`. (Schema supports both today.)
- **Recharge validity/expiry**: confirm needed (provisional columns added).
- **`sessions` table**: keep only if not using Auth.js JWT sessions.
- **Self-service second field** (privacy) vs pure public lookup.
