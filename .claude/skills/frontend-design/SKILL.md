---
name: frontend-design
description: Build or restyle UI for the RFID mess-management app using the "Warm Cafeteria" design system. Use when creating pages, components, or styling — dashboard, counter POS, recharge, cards, reports, public self-service — so output matches the theme tokens, component patterns, and accessibility rules.
---

# Frontend Design — "Warm Cafeteria"

Produce UI that is consistent with this project's design system. The authoritative spec is
[theme.md](../../../theme.md); the enforceable rules are in
[.claude/rules/frontend.md](../../rules/frontend.md). This skill is the quick operating procedure.

## When to use

Any time you create or change visible UI: a new page/route, a component, a layout, or restyling.

## Procedure

1. **Read the relevant spec sections** before writing: theme.md §2 (palette), §4 (type), §5
   (spacing/layout), §6 (component patterns), §8 (a11y). For counter UI, also plan.md §8.
2. **Use tokens, never raw values.** Map to Tailwind token classes wired to the CSS custom
   properties — `bg-surface`, `bg-surface-2`, `text-ink`, `text-ink-2`, `text-muted`, `bg-gold`,
   `bg-gold-soft`, `text-sage-deep`, `bg-tomato-soft`, `rounded-md`, `shadow-lg`, etc. No hardcoded
   hex in components.
3. **Reuse documented component patterns** rather than inventing new ones:
   - Stat/KPI cards: `--sage`, `--gold`, and plain white variants (theme §6.2).
   - Buttons: `.btn--primary` (gold), `.btn--ghost`, `.btn--pill` (theme §6.3).
   - Chips/badges/status dots: `badge--ok|pending|fail`, `dot--ok|hot|warn|err` (theme §6.5).
   - Inputs incl. `.input--rfid` monospace scan field (theme §6.6).
   - Tables/ledger rows (theme §6.7).
   - App shell: cream tray sidebar (232px) + floating white panel on `--canvas` (theme §5).
4. **Typography:** Fraunces for display/headings/KPI numbers, Inter Tight for body/UI, JetBrains
   Mono for card UIDs, balances, codes, timestamps.
5. **Server-first:** default to Server Components; add `"use client"` only for interactivity.
   Counter and public self-service are the client/offline exceptions.
6. **Accessibility is part of "done"** (theme §8): never color-only state (pair dot + label),
   `--muted` for captions only, keep gold-button text legible, preserve focus rings, honor
   `prefers-reduced-motion`, real labels on inputs.
7. **States:** include loading + empty states for lists/tables; light + dark via
   `[data-theme="dark"]`; responsive (tray collapses to top bar < 760px).

## Counter screen specifics

Big, unambiguous result (APPROVED/REJECTED/BLOCKED/QUEUED) with the cardholder **photo
prominent** for visual verification, name, category, balances, and a beep. Keep the scan input
focused; the UI renders the server's decision and never computes approve/reject or balances.

## Checklist before finishing

- [ ] Only token classes (no raw hex / arbitrary colors).
- [ ] Correct font per text role; mono for IDs/balances.
- [ ] Reused an existing component pattern where one fits.
- [ ] Loading + empty states; light & dark; responsive.
- [ ] A11y: labels, focus rings, no color-only state, reduced-motion, contrast respected.
- [ ] No business/money logic in the component — it renders server data.
