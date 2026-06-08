---
description: Diagnose and fix a tracked issue in the RFID mess-management app, with the right context, tests, and verification.
argument-hint: <issue number/url or short description>
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

Fix this issue: **$ARGUMENTS**

Work through it methodically — don't jump to a patch.

## 1. Understand
- If `$ARGUMENTS` is an issue number/URL and `gh` is available, read it (`gh issue view`).
  Otherwise treat the text as the report. Restate the problem and expected vs actual behavior.
- Load the rules that apply: `CLAUDE.md`, the relevant `.claude/rules/*.md`, and — for any
  money/ledger/migration issue — `db-schema.md` / `plan.md`. The mock (`rfid-coupon.html`) is the
  behavioral spec.

## 2. Reproduce & root-cause
- Reproduce the failure (failing test, wrong value, error). If the cause is non-obvious, delegate
  to the `debugger` agent. Do **not** guess-patch — confirm the root cause with evidence first.

## 3. Plan
- State the minimal fix at the true cause and which invariants it must preserve (transactional
  mutations, append-only ledger, idempotency, permission + branch scope, audit). For anything
  touching ledger/auth/migrations, lay out the approach before editing.

## 4. Implement
- Make the smallest correct change. Keep money as Decimal, mutations inside `$transaction`,
  ledgers append-only, writes idempotent and authorized, and add the `audit_log` write if it's a
  state change. Use theme tokens for any UI.

## 5. Test & verify
- Add or update a regression test (Vitest for logic/ledger, Playwright for counter flows) that
  fails before and passes after. Run the relevant tests + typecheck/lint. Report the actual
  output — if something still fails, say so.

## 6. Wrap up
- Summarize root cause → fix → verification. Note any follow-ups or deferred-decision impact
  (plan.md §13). Keep planning docs in sync if the change alters documented behavior.
