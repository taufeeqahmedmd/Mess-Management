# Project Audit Report — RFID Mess Management

> Date: 2026-07-03 · Branch: `test` · Scope: whole project (code, schema, tests, config, docs).
> Method: direct static audit (grep/read across `services/`, `app/`, `lib/`, `prisma/`, `tests/`,
> `.github/`). A parallel multi-agent pass was attempted but the agents failed on infrastructure
> errors, so this report is the hand-verified result.
>
> **Caveat on depth:** RBAC presence, public-endpoint hardening, money discipline, ledger
> invariants, and the coupon-only migration were verified directly. What was **not** exhaustively
> line-checked: every single query for branch-scope correctness, live Jodo payment behavior, the
> service worker / offline queue at runtime, and e2e flows. Those are called out as "review areas"
> rather than confirmed defects.

---

## Summary

| # | Severity | Category | Finding | Location | Status |
|---|----------|----------|---------|----------|--------|
| F1 | Medium | Money discipline | Online-pay order amount computed with JS float | `app/api/public/pay/route.ts:71,74` | ✅ **Fixed** — recomputed via `couponValue` (Decimal); float only at the Jodo JSON boundary |
| F2 | Medium | Stale UX copy | 8 leftover "wallet" references after coupon-only migration (some user-facing & misleading) | see F2 list | ✅ **Fixed** — all 8 reworded coupon-only |
| F3 | Low | Test coverage | Money-critical online top-up credit + Jodo + access-control save are untested | `lib/run-online-topup.ts`, `lib/jodo.ts`, `access-control/actions.ts` | ✅ **Mostly fixed** — 15 new tests (`online-topup.test.ts`, `access-control.test.ts`); `lib/jodo.ts` parsing still untested |
| F4 | Low | CI | CI only runs on `main`; pushes to the working branch `test` run nothing | `.github/workflows/ci.yml:4-7` | ✅ **Fixed** — CI now also runs on pushes to `test` |
| F5 | Low | Reporting cosmetics | Consumption CSV shows blank `paidBy` for food-request rows | `app/api/reports/consumption/route.ts` | ✅ **Fixed** — null maps to `food_request` |
| F6 | Low | Naming | `WalletGlyph` icon reused for the Top Up button | `app/(auth)/login/page.tsx` | ✅ **Fixed** — renamed `TopUpGlyph` |
| F7 | Info | Tech debt | Dormant wallet schema retained by design (documented) | `prisma/schema.prisma` | Accepted (by design) |
| F8 | Info | Review area | Branch-scope not exhaustively verified across every query | app-wide | ✅ **Swept** — scoping holds on all list/report/query paths checked; one observation below |

No Critical findings. No High findings confirmed.

**F8 sweep result (2026-07-03):** every list/report page applies the actor's branch scope
(`branchWhere`/`branchScope`/actor-constrained dropdowns); vendors and settings master data are
global by design (Vendor has no `branchId`). **One observation:** counter-operator assignment
(`settings/counters/new` + edit) lists ALL active staff regardless of branch, so a scoped admin can
see and assign staff from other branches as operators. Possibly intentional (shared staff) —
decide, and if not intended, filter `appUser.findMany` by the actor's branch and validate on save.

---

## Detailed findings

### F1 — [Medium] Online-pay order amount is computed with JS float
**Location:** `app/api/public/pay/route.ts:71,74`
```ts
amount += Number.parseFloat(price) * it.qty;   // float accumulation
...
amount = Number(amount.toFixed(2));
```
**Issue.** This violates the project's non-negotiable "money is `Decimal`, never float." The
authenticated recharge path prices coupons with `couponValue()` (decimal.js), and the *credit* path
(`lib/run-online-topup.ts:54`) also recomputes with Decimal — but the **public pay route computes
the amount the customer is actually charged via Jodo using float math**, then stores it as
`paymentOrder.amount`.
**Impact.** Low real-world impact (2-decimal rates × small quantities rarely drift after
`toFixed(2)`), but two concrete risks: (a) in rare accumulation cases the **charged amount can
differ by a cent** from the Decimal-computed value the coupons are worth; (b) `paymentOrder.amount`
(from float) can then differ from `recharge.amount` (from `couponValue`, Decimal), a small
reconciliation mismatch.
**Fix.** Compute the total with `Decimal` (reuse `couponValue()` or sum `new Prisma.Decimal(price).mul(qty)`),
and pass `total.toFixed(2)` to Jodo — mirroring `run-online-topup.ts`.

---

### F2 — [Medium] Stale "wallet" copy after the coupon-only migration
The wallet feature was removed, but several user-facing strings and comments still mention a wallet.
The middle three are **actively misleading** (they tell operators the cardholder is charged at
delivery, which is no longer true).

| Location | Current text | Problem |
|---|---|---|
| `app/(auth)/login/page.tsx:47` | "RFID coupon & wallet management for the cafeteria." | Brand tagline still says "wallet" (manifest/layout were updated, this was missed). |
| `app/(app)/food-requests/[id]/page.tsx:102` | "…the wallet (RFID verified). Recorded in the consumption ledger." | Delivery no longer charges a wallet. **Misleading.** |
| `app/(app)/food-requests/food-request-form.tsx:223` | "The cardholder's wallet is only charged at delivery, after an RFID tap confirms the card." | No charge happens now. **Misleading.** |
| `app/(app)/recharge/expiry-button.tsx:20` | "…zero the wallet + coupons of cardholders…" | Only coupons are zeroed now. |
| `app/(app)/users/import/page.tsx:20` | "…wallet, and a card if a UID is given…" | No wallet row is created on import anymore. |
| `app/(app)/recharge/import-modal.tsx:173` | "…the wallet value is computed from coupons × rate…" | Should read "recharge value". |
| `app/(app)/recharge/recharge-form.tsx:31` | comment: "a live wallet total" | Stale comment. |
| `app/(app)/vendor-dashboard/page.tsx:17` | comment: "regardless of wallet vs coupon" | Stale comment. |

**Fix.** Reword to coupon-only. The three "charged at delivery" strings should say the delivery is
*recorded* (RFID-verified) and the cardholder is *not* charged.

---

### F3 — [Low] Money-critical paths lack unit tests
**Covered today (12 suites):** tap engine, recharge (validate/couponValue/reversal), expiry-shaped
logic, food-request fulfillment, food-request domain, pricing/rates, RBAC, idempotency, reporting,
settlement, public-lookup, meal-window, time.
**Untested (notable):**
- `lib/run-online-topup.ts` — the **online top-up credit** (Decimal amount recompute, idempotency,
  P2002 race handling). This moves money and has no test.
- `lib/jodo.ts` — order create / get-order parsing (payment-url extraction, `status==="paid"`).
- `app/(app)/access-control/actions.ts` — `saveAccessControlAction` (the permission self-heal +
  no-privilege-escalation guard). Regression-prone and untested.
- `lib/run-tap.ts` — the retry wrapper around the tap engine.
**Fix.** Add unit tests for `creditPaymentOrder` (idempotent replay returns `already:true`; amount
recomputed from catalog; missing-rate rejected) and for the access-control save (escalation guard,
missing-row self-heal).

---

### F4 — [Low] CI does not run on the working branch
**Location:** `.github/workflows/ci.yml:4-7` — triggers only on `push`/`pull_request` to `main`.
The team develops on `test` and pushes there frequently; **none of those pushes run lint/typecheck/
tests/build**. Problems are only caught when a PR targets `main`.
**Fix.** Add `test` to the `push` branches, or run on `pull_request` for all branches, or trigger on
all pushes. (CI itself is otherwise solid: lint → typecheck → unit tests → build.)

---

### F5 — [Low] Consumption CSV shows blank `paidBy` for food-request deliveries
**Location:** `app/api/reports/consumption/route.ts` (the `r.paidBy ?? ""` mapping).
Food-request redemptions now carry `paidBy = null`, so the CSV `paidBy` column is empty for them.
The on-screen report already labels these "Food request"; the CSV should match for consistency.
**Fix.** Map `null` → `"food_request"` (or `"—"`) in the CSV row.

---

### F6 — [Low] `WalletGlyph` reused for the Top Up button
**Location:** `app/(auth)/login/page.tsx` (`WalletGlyph` renders inside the "Top Up" link).
Functionally fine (a wallet-ish icon for top-up), but the name is a leftover from the wallet era.
**Fix.** Rename to `TopUpGlyph`/`CardGlyph` for clarity, or swap the glyph. Cosmetic.

---

### F7 — [Info] Dormant wallet schema retained (by design)
`wallets`, `wallet_transactions`, `Recharge.remainingAmount`, and `PaidBy.wallet` remain in
`schema.prisma` but are never read/written — an intentional decision (no migration) documented in
`CLAUDE.md`, `README.md`, `plan.md`, `db-schema.md`. No action required unless a later cleanup
migration is wanted. If you ever drop them, migrate historical `redemptions.paid_by='wallet'` first.

---

### F8 — [Info/Review] Branch-scope not exhaustively verified
Branch scoping *is* applied in the queries reviewed (reports, recharge search, users, food requests,
settlements). It was **not** line-checked across every query in the app. Recommend a focused pass:
grep every `prisma.*.findMany/aggregate/count` in `app/` and `services/` and confirm each applies
the actor's `branchId` filter (or is legitimately all-branch). Bake scoping into the data-access
layer where possible rather than per-call-site.

---

## Verified correct (important invariants that hold)

- **RBAC / deny-by-default.** All 20 `app/**/actions.ts` files guard with
  `requirePermission`/`requireActor`/`can()`. Access Control adds a no-privilege-escalation guard
  (a non-super-admin can only grant permissions it holds) and self-heals missing permission rows.
- **Live authorization.** `lib/session.ts#getActor` re-reads status/permissions/branch from the DB
  **every request** (JWT only authenticates), so a revoked role or disabled account takes effect
  immediately — no waiting for token expiry.
- **Public endpoints hardened.** `/api/public/{balance,history,pay,recharge-options}` are all
  rate-limited (`lib/rate-limit.ts`), Zod-validated, and return minimal fields. `getPublicBalance`
  exposes no internal ids/department/branch/card UID.
- **No SQL injection surface.** No `$queryRaw`/`$executeRaw`/`*Unsafe` anywhere in app code; all DB
  access is through the Prisma query builder.
- **Money = Decimal on the real money paths.** Recharge (`priceCoupons`/`couponValue`), online
  credit (`run-online-topup`), tap, expiry, and settlement use Prisma `Decimal`. Float appears only
  at render boundaries (`lib/format.ts` `toNumber`, chart geometry in `reporting.ts` with an
  explicit "display-only" comment) — and the one server-side exception is F1.
- **Append-only ledger + reconciliation.** `coupon_transactions` are never updated/deleted;
  corrections post reversal/expiry rows; `applyRecharge` always writes `couponBalance` **and**
  `rechargeCoupon` together; reversal decrements both. Cached `couponBalance.count` stays
  re-derivable from the ledger.
- **Reporting is coupon-migration-safe.** `consumptionSummary` sums **`rateApplied`** (meal value)
  and `vendorAmount` (cost) — *not* `amount` — with a comment explaining that coupon taps debit ₹0
  at the counter. So food-request deliveries (`amount:0`, `rateApplied`=sale, `vendorAmount`=cost)
  are counted correctly in sale/cost/profit and in vendor settlement.
- **Idempotency + concurrency.** Tap/sync keyed on `clientUuid` (unique); online top-up keyed on the
  order's `clientUuid` + order status + a `P2002` catch; all balance mutations run inside a single
  `$transaction` with version-guarded `updateMany` and retry-on-conflict.
- **Schema well-constrained.** 87 combined `@unique`/`@@unique`/`@@index`/`onDelete`/`@db.Decimal`
  markers; migrations present and additive.
- **CI content.** lint → typecheck → unit tests → build (only the trigger scope is limited — F4).

---

## Test-coverage matrix (critical paths)

| Path | Tested? |
|---|---|
| Tap / consumption engine | ✅ `consumption.test.ts` |
| Recharge validate / price / reversal | ✅ `recharge.test.ts` |
| Food-request fulfillment (coupon-only) | ✅ `food-request-fulfillment.test.ts` |
| Food-request domain / pricing | ✅ `food-request.test.ts` |
| Pricing / rate resolution | ✅ `rates.test.ts` |
| Settlement | ✅ `settlement.test.ts` |
| Reporting aggregates | ✅ `reporting.test.ts` |
| RBAC guard | ✅ `rbac.test.ts` |
| Idempotency helpers | ✅ `idempotency.test.ts` |
| Public lookup | ✅ `public-lookup.test.ts` |
| **Online top-up credit (`run-online-topup`)** | ❌ (F3) |
| **Jodo order create/parse (`lib/jodo`)** | ❌ (F3) |
| **Access-control save (self-heal / escalation)** | ❌ (F3) |
| e2e (counter offline, Playwright) | ❌ none present |

---

## Suggested order to work through

1. **F1** — make the online-pay amount Decimal (money-critical discipline; quick).
2. **F2** — fix the 3 misleading "charged at delivery" strings first, then the rest.
3. **F3** — add tests for `creditPaymentOrder` and the access-control save (guards regressions on
   money + permissions).
4. **F4** — widen CI to the `test` branch so you get feedback on every push.
5. **F5 / F6** — cosmetics.
6. **F8** — do the branch-scope sweep when convenient.
7. **F7** — leave as-is unless a schema cleanup is planned.
