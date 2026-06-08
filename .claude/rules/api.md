# API Rules

Applies to Server Actions, Route Handlers under `app/api/`, and the `services/` they call. See
[plan.md](../../plan.md) §4 (RBAC), §8 (counter/offline), §9 (API surface), §10 (security).

---

## Shape of the backend

- **Server Actions** for most authenticated mutations (CRUD per module).
- **Route Handlers** for: the counter (`POST /api/counter/tap`, `/api/counter/sync`), public
  self-service (`GET /api/public/balance`, `/api/public/history`), and anything needing explicit
  POST semantics, idempotency, or CSV streaming.
- All money/consumption logic lives in **pure `services/`** functions called inside a DB
  transaction. Handlers and actions are thin: authenticate → authorize → validate → call service
  → audit → respond. **No business logic in the route/action itself.**

## Authentication & authorization (deny by default)

- Auth.js (Credentials) for staff sessions. **Every** server action and protected route checks
  the required `module.action` permission before doing anything. Super Admin bypasses.
- Resolve and enforce **branch scope** from the actor on every request (NULL = all-branch).
  Never let a scoped staff member read/write another branch's data.
- The counter authenticates an **operator**; only their assigned active counters are selectable,
  and the operator id is **stamped on every tap and recharge**.
- Public endpoints (`/api/public/*`) are unauthenticated lookups — treat as hostile input,
  **rate-limit** them, and return only the minimum fields.

## Validation

- Validate every input with **Zod** at the boundary, reusing the shared client/server schema.
  Reject malformed input with 400 + field errors. The server is the final authority even if the
  client already validated.

## Idempotency & the tap engine

- `POST /api/counter/tap` `{ cardUid, counterId, clientTxId }` → run the consumption engine in a
  single `$transaction`, return `APPROVED | REJECTED | BLOCKED` + cardholder photo, name,
  category, balances. **Idempotent on `clientTxId`** — a replayed tap returns the original result,
  never charges twice.
- Default tap resolution (configurable via `settings.resolution_strategy`, default `coupon_first`):
  1. compute meal price for the cardholder's category;
  2. if a coupon exists for that meal → consume one coupon (`paid_by=coupon`, amount 0);
  3. else if wallet ≥ price → debit wallet (`paid_by=wallet`);
  4. else → `REJECTED` (insufficient).
- `POST /api/counter/sync` bulk-replays the offline queue; same idempotency guarantee. Surface a
  **sync report** including any negative reconciliations (offline overspend is a known trade-off).
- Enforce server-side: blocked cards, duplicate window, once-per-meal-session, "active meal now".

## Recharge & reversal

- Recharge writes a `recharges` row + updates cached balance(s) inside a transaction, and records
  the operator. **Edits/deletes reverse the remaining portion via offsetting ledger rows** — never
  mutate posted ledger rows. Expiry claw-back is a scheduled job writing `expiry` rows.

## Auditing & errors

- **Every state change writes an `audit_log` row** (actor, action, entity, before/after JSON, ip,
  user agent) within the same transaction.
- Return structured errors; never leak stack traces or internal ids to clients. Log server-side.
- Use correct status codes (401 unauthenticated, 403 unauthorized, 400 invalid, 409 conflict for
  idempotency/version clashes, 422 business-rule rejection where useful).

## Money discipline

- `Decimal(12,2)` end-to-end; never float. Never trust a client-sent balance, price, or amount —
  always recompute server-side from the DB.
