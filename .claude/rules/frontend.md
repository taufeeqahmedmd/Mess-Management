# Frontend Rules

Applies to everything under `app/`, `components/`, and any client code. The visual source of
truth is [theme.md](../../theme.md) ("Warm Cafeteria" design system). Read it before building UI.

---

## Framework

- **Next.js App Router + TypeScript.** Default to **Server Components**; add `"use client"` only
  when you need state, effects, event handlers, or browser APIs. Keep client bundles small.
- Data fetching for authenticated screens goes through Server Components / Server Actions — not
  client-side fetch — except the **counter** and **public self-service** flows, which use Route
  Handlers (offline + CSV + idempotency).
- Co-locate route UI under the correct group: `/(public)`, `/(auth)`, `/(app)`, `/counter`.

## Theme & styling

- **Tailwind only**, mapped to the CSS custom properties in [theme.md](../../theme.md) §3/§7.
  Never hardcode hex colors in components — use the token classes (`bg-surface`, `text-ink`,
  `bg-gold`, `text-sage-deep`, `rounded-md`, `shadow-lg`, …).
- Respect the design language: warm neutrals, generous radii, soft diffuse shadows, airy spacing
  (gutters 20–24px). Nothing is a sharp rectangle; depth comes from blur, not hard borders.
- Fonts: **Fraunces** (display/headings/KPIs), **Inter Tight** (body/UI), **JetBrains Mono**
  (card UIDs, balances, codes, timestamps — RFID data is monospace by nature).
- Reuse the documented component patterns (stat cards `--sage`/`--gold`/plain, pill buttons,
  chips/badges, status dots, `.input--rfid`). Build a thin shared component layer rather than
  re-styling per page.
- Support **light (default) and dark** via `[data-theme="dark"]`. Theme toggle in the app shell.

## Accessibility (enforced — see theme.md §8)

- Never signal state by color alone — pair status dots/badges with a label or icon
  (`● Active`, `● Failed`).
- `--muted` is ~3:1 contrast → captions/labels only, never actionable text (use `--ink-2`).
- Gold + white text is not AA at small sizes — use `--ink` on gold for small labels, or
  `--gold-deep` + white; verify in context.
- Keep visible focus rings (the gold glow + border). Don't remove outlines without a replacement.
- Honor `prefers-reduced-motion` (drop the translateY hovers/transitions).
- Real labels on every input; correct roles; keyboard-operable everything (the counter especially
  must be fully keyboard-driven — the reader *is* a keyboard).

## The RFID Counter screen (critical path)

- Full-screen POS at `/counter`. A single focused input captures the reader's `keydown` burst
  (digits + Enter). Use inter-key timing to distinguish a reader burst from manual typing; keep
  the input focused at all times.
- After a tap, show a **big, unambiguous result** (APPROVED / REJECTED / BLOCKED / QUEUED) with
  the cardholder **photo prominent** for the operator to visually verify, plus name, category,
  and balances. Audible beep on result.
- Show recent taps. Reflect online/offline state clearly; offline taps render as **QUEUED** and
  reconcile on sync (a tap may flip to rejected on sync — surface that honestly).
- The UI **never computes approve/reject or balances** — it renders the server's decision.

## Forms & validation

- Validate with the **shared Zod schema** (same schema client + server). Show inline,
  per-field errors. Never trust client validation for integrity — the server re-validates.
- Money inputs: treat as strings → Decimal; never do float math in the browser.

## State & data

- Prefer server state (RSC + Server Actions) over client stores. Use client state only for
  genuinely interactive/ephemeral UI (counter queue, modals, toggles).
- IndexedDB + service worker are **counter-only** (offline queue). Don't add offline behavior to
  admin screens.

## Quality bar

- Loading and empty states for every list/table. Optimistic UI only where reconciliation is safe.
- Components are typed; no `any` on props. Keep them small and composable.
- Mobile: tray sidebar collapses to a top bar < 760px; panel goes edge-to-edge.
