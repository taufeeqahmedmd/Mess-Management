# Database Rules

Applies to `prisma/`, `services/` (data access), and any code touching persistence. The
authoritative schema is [db-schema.md](../../db-schema.md). **Prisma schema (`schema.prisma`)
targeting PostgreSQL is the source of truth**; the MySQL DDL in that doc is the annotated
conceptual reference only.

---

## Source of truth & migrations

- **PostgreSQL + Prisma managed migrations.** Never hand-edit the DB; change `schema.prisma`,
  generate a migration, commit it. One logical change = one reviewed migration.
- When porting the DDL to Prisma, apply the documented MySQL→PG deltas (db-schema.md §0):
  `BIGINT GENERATED ALWAYS AS IDENTITY` (no `UNSIGNED`), `BOOLEAN`, `JSONB`, native enums,
  `@updatedAt`, `timestamptz`, real column name `setting_key` (not reserved `key`).
- Keep `schema.prisma`, the seed script, and the two planning docs in sync within the same change.

## Money & ledger integrity (do not violate)

- **Money = `Decimal(12,2)`. Never float.** Use Prisma `Decimal` end-to-end. `CHECK (>= 0)` on
  balances + enforce non-negative in the service.
- **Ledgers are append-only:** `wallet_transactions` / `coupon_transactions` rows are **never
  updated or deleted**. Corrections post new `reversal` / `adjustment` / `expiry` rows.
  `wallets` / `coupon_balances` are cached current values, fully reconcilable from the ledger.
- **All balance mutations run inside a single `prisma.$transaction`** — read balance, validate,
  write ledger row(s), update cached balance, write audit — atomically. No partial writes.
- **Optimistic locking:** bump `wallets.version` / `coupon_balances.version` on every mutation;
  concurrent taps retry on version mismatch.

## Idempotency & hard constraints

- Every offline-originating write carries a UNIQUE `client_uuid` / `clientTxId`
  (`recharges`, `redemptions`, `offline_queue`). Replay must be a safe no-op, never a double-post.
- **One active card per cardholder** → Postgres partial unique index
  (`CREATE UNIQUE INDEX ... WHERE status='active'`) **plus** a service-layer guard. (PG removes
  the MySQL trigger workaround — don't reintroduce triggers.)
- **Once-per-meal-session / duplicate window** → enforced in the service against recent
  `redemptions`, driven by `settings`; optionally a partial unique index for approved taps.
- Foreign keys enforced everywhere. Soft-delete master tables via `deleted_at`; **never** soft- or
  hard-delete ledger/redemption rows — reverse them instead.

## Pricing & catalog

- Rate = **meal × category × branch**, date-versioned via `valid_from / valid_to`. Current rate =
  matching row with `valid_from <= today AND (valid_to IS NULL OR valid_to >= today)`, latest
  `valid_from`. Always resolve price server-side at tap time.
- "Active meal now" comes from `meal_types.start_time/end_time` (overnight windows handled in the
  service, not the DB).

## Cardholders vs staff

- `users` = **cardholders** (no login; `code` is the public self-service handle, globally unique).
  `app_users` = **staff** (login + `role_id` + `branch_id`). Keep this split — don't merge them.

## Branch scoping

- `app_users.branch_id` / row `branch_id`: NULL = all-branch (Super Admin); non-null = scoped.
  Every multi-tenant query filters by branch unless the actor is all-branch. Bake scoping into the
  data-access layer, not ad-hoc per call site.

## Reconciliation mindset

- Cached balances must always be re-derivable from the ledger. If you add a balance-affecting
  path, add the matching ledger write and confirm reconciliation. Offline taps can produce
  negative reconciliations (known trade-off) — flag them in the sync report, don't hide them.

## Deferred decisions (don't silently resolve)

- **Coupon = count vs earmarked money** (keeps/collapses `coupon_balances` +
  `coupon_transactions`). **Recharge validity/expiry** columns are provisional. **`sessions`**
  table only if not using Auth.js JWT. See db-schema.md §13 — surface these, don't pick blindly.

## Seed

Mirror the mock (db-schema.md §12): 1 branch, Super Admin, full role/permission set, categories,
meal_types with windows, the rate matrix, payment modes, counters + operator assignment, and the
default `settings` (`duplicate_window_seconds=120`, `prevent_per_meal_session=true`,
`resolution_strategy='coupon_first'`, `currency='INR'`).
