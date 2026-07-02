# CLAUDE.md — RFID Coupon / Mess Management System

Guidance for Claude Code when working in this repository. Read this first; it points to the
detailed rule files under `.claude/rules/`.

---

## What this project is

A production rebuild of a cafeteria **RFID coupon** system: multi-user, role-based,
server-enforced business rules, and an **offline-capable PWA counter**. Replaces a single-file
PWA mock (`rfid-coupon.html`). Target scale ~2,000 cardholders — **correctness > throughput**.

> **Wallet retired (coupon-only).** The money-balance "wallet" model was removed — every meal is
> paid by **coupon**. Recharges grant coupons; taps and food-request deliveries consume/record
> coupons only. The `wallets` / `wallet_transactions` tables and `Recharge.remaining_amount` remain
> in the schema but are **dormant** (never read or written) — don't reintroduce wallet logic.

Source-of-truth planning docs (read before non-trivial work):
- [plan.md](plan.md) — product plan, roles, modules, phased roadmap, open decisions.
- [db-schema.md](db-schema.md) — authoritative schema (conceptual MySQL DDL + PG/Prisma deltas).
- [theme.md](theme.md) — "Warm Cafeteria" design system (tokens, components, a11y).

> These three `.md` files are **living documents**. If a decision changes, update them in the
> same change — don't let code and docs drift.

---

## Tech stack (locked — do not swap without explicit approval)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Backend | Route Handlers + Server Actions (no separate API service) |
| ORM | Prisma (source of truth for schema + migrations) |
| Database | **PostgreSQL** |
| Auth | Auth.js (NextAuth) — Credentials provider, RBAC middleware |
| Styling | Tailwind CSS mapped to the theme's CSS custom properties |
| Validation | Zod (shared client/server schemas) |
| Offline | PWA: service worker + IndexedDB queue (counter only) |
| Testing | Vitest (unit) + Playwright (e2e) |

RFID hardware = a **USB reader acting as a keyboard** (types card number + Enter). No drivers/SDK.

---

## Folder layout (target)

```
/app  /(public) /(auth) /(app) /counter /api
/components  /services  /lib  /prisma  /types  /tests
```

`services/` holds **pure, testable** business logic (ledger, consumption engine, RBAC, audit).
`lib/` holds wiring (auth config, prisma client, rbac guards).

---

## Non-negotiable rules (the spine of this app)

1. **The client never decides money or balances.** All coupon mutations run server-side
   inside a single Prisma `$transaction`. The mock's client engine is the *spec*, not the impl.
2. **Money is `Decimal(12,2)`, never float.** The coupon ledger (`coupon_transactions`) is
   **append-only** — corrections are new reversal/adjustment rows, never updates to posted rows.
3. **Idempotency:** every offline-originating write (taps, recharges) carries a `client_uuid` /
   `clientTxId` with a UNIQUE constraint. Sync replay must never double-charge.
4. **Permission check on every server action / route** — deny by default. Super Admin bypasses.
   Permissions are `module.action` strings (see [plan.md](plan.md) §4).
5. **Audit everything:** every state change writes an `audit_log` row (who / what / before /
   after / when / ip).
6. **Cardholders ≠ staff.** Cardholders never log in (public self-service lookup only); staff log
   in and carry roles/permissions. (DDL: `users` = cardholders, `app_users` = staff.)

Detailed guidance lives in the rule files — **read the relevant one before editing that layer**:
- [.claude/rules/frontend.md](.claude/rules/frontend.md) — UI, components, theme tokens, a11y.
- [.claude/rules/database.md](.claude/rules/database.md) — Prisma, migrations, ledger integrity.
- [.claude/rules/api.md](.claude/rules/api.md) — Server Actions, Route Handlers, auth, idempotency.

---

## Working conventions

- **Plan-before-build for risky changes** (ledger, consumption engine, auth, migrations). State
  the approach, then implement.
- **Tests follow the money.** Any change to the consumption engine, recharge reversal, or
  expiry claw-back ships with Vitest coverage. Counter flows get Playwright coverage.
- **Validate at the boundary** with Zod; reuse the same schema client + server.
- **Decimal discipline:** use Prisma `Decimal` / a decimal lib end-to-end; never coerce to JS
  `number` for arithmetic on money.
- **Branch scoping:** non-null `branch_id` = scoped; null = all-branch (Super Admin). Queries
  filter by branch unless the actor is all-branch.
- Don't introduce new deps casually — the stack is locked. Flag additions for approval.

## Commands & helpers available in this repo

- `/fix-issue` — structured workflow to diagnose and fix a tracked issue.
- `/pr-review` — review the current branch's changes against this project's rules.
- Agents: `code-reviewer`, `debugger`, `test-writer`, `refactorer`, `security-auditor`
  (`.claude/agents/`). Skill: `frontend-design` (`.claude/skills/frontend-design/`).

## When unsure

Open decisions are tracked in [plan.md](plan.md) §13 and [db-schema.md](db-schema.md) §13. The
"coupon = count vs earmarked money" decision is now **resolved: coupon = count** (wallet retired).
If your task touches another deferred decision, surface it rather than silently picking.
