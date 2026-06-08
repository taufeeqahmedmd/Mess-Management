---
description: Review the current branch's changes against this project's rules (money/ledger integrity, RBAC, idempotency, theme/a11y) before opening or merging a PR.
argument-hint: [PR number/url — optional; defaults to local diff]
allowed-tools: Read, Grep, Glob, Bash
---

Review the changes for: **$ARGUMENTS** (if empty, review the current local diff).

## 1. Gather the diff
- If `$ARGUMENTS` is a PR number/URL and `gh` is available: `gh pr view` + `gh pr diff`.
- Otherwise: `git diff main...HEAD` (fall back to `git diff` / `git diff --staged`). If git isn't
  available, ask which files to review. Read surrounding code for context before judging.

## 2. Load the bar
`CLAUDE.md` + the relevant `.claude/rules/*.md`; `db-schema.md` for data/money changes. For a
thorough pass, delegate to the `code-reviewer` agent (and `security-auditor` if the diff touches
auth, money, or public endpoints).

## 3. Review against the project's spine (priority order)
- **Money & ledger:** Decimal not float; mutations in one `$transaction`; ledgers append-only
  (corrections = new rows); cached balances reconcilable; optimistic-lock version bumped.
- **Idempotency:** offline writes keyed by unique `clientTxId`/`client_uuid`; replay-safe.
- **Authorization:** every action/route checks `module.action` (deny-by-default); branch scope
  enforced; operator stamped on taps/recharges; public endpoints minimal + rate-limited.
- **Validation:** Zod at the boundary, shared client/server; server is the authority.
- **Audit:** state changes write `audit_log` in the same transaction.
- **Frontend/theme:** token classes not raw hex; correct fonts; a11y (no color-only state, focus
  rings, contrast, reduced-motion); Server Components by default.
- **Tests:** money/consumption/reversal/expiry changes have Vitest; counter flows have Playwright.
- **General:** types (no stray `any`), error handling, edge cases, dead code, naming, docs in sync.

## 4. Report
Group findings by severity — **🔴 Blocking**, **🟠 Should-fix**, **🟡 Nit** — each with file:line,
the problem, why it matters here, the specific rule violated, and a concrete fix. End with a
one-line verdict: **approve / approve-with-changes / needs-work**. Cite real lines; don't pad.
