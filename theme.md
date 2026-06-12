# Theme — "Bhojan Tricolour" Design System

> Derived from the redesigned reference mockups (`ui-ref/`): a warm off-white canvas, the **Ashoka
> Chakra** brand mark, a **तिरंगा (tricolour)** rule, and an Indian-flag accent palette — **saffron**
> primary, **India-green** positive, **navy** info.
> Target stack: **Next.js (App Router) + Tailwind CSS v4**. Tokens are exposed as CSS custom
> properties in [`app/globals.css`](app/globals.css) (the live source of truth) and mapped onto
> Tailwind utilities via `@theme`.
>
> **Token-name compatibility:** this is a re-skin, not a rename. The semantic utility names are
> stable — `gold` = the **primary (saffron)**, `sage` = **positive (green)**, `navy` = the new
> **info** accent. Existing components keep using `bg-gold`, `text-sage-deep`, etc.; only the
> values changed. A dark variant is provided at the end for parity.

---

## 1. Design language (what the mockups are "saying")

The mockups read as **civic, trustworthy, and warm** — an Indian institutional/cafeteria product
with national-identity cues, not a generic enterprise admin panel.

| Trait | How it shows up | Implication for our UI |
|---|---|---|
| **Warm neutrals** | Off-white canvas (`#FBF8F2`), near-white sidebar, no pure-cold grays | Backgrounds carry a slight warmth; avoid clinical `#fff`-on-`#000` |
| **Tricolour identity** | Ashoka Chakra mark + saffron/white/green rule under the wordmark | Brand block in the sidebar; `.tricolour` + `.chakra` helpers in globals.css |
| **Soft & rounded** | Cards ~16px radius, pill search/buttons, 10px nav items/fields | Generous `border-radius`; nothing is a sharp rectangle |
| **Diffuse elevation** | Wide, low-opacity shadows; cards rest lightly on the canvas | Soft shadows, no hard 1px drop shadows; depth via blur not borders |
| **Flag-derived accents** | Saffron primary, India-green positive, navy info, red danger | A small, meaningful accent palette — not primary-blue tech |
| **Quiet typography** | Dark warm-charcoal headings, muted warm-gray body | High-contrast headlines, low-contrast supporting text |

**One-line mood:** *warm off-white paper, the Chakra in navy, a saffron-and-green rule.*

---

## 2. Color palette

### 2.1 Core neutrals (warm)

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#FBF8F2` | App backdrop / content area (warm off-white) |
| `--surface` | `#FFFFFF` | Cards / panels (white) |
| `--surface-2` | `#FCFAF5` | Table headers, raised inner surfaces, totals row |
| `--tray` | `#FFFCF6` | Sidebar base |
| `--tray-2` | `#FFFEFB` | Sidebar highlight |
| `--line` | `#ECE7DD` | Hairline borders |
| `--line-strong` | `#E2DCD0` | Stronger divider / input border |

### 2.2 Text (warm charcoal → muted)

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#1C1A17` | Headings, primary text (near-black, warm) |
| `--ink-2` | `#5A544B` | Secondary / actionable text |
| `--muted` | `#7C766C` | Captions, hints, table sub-text |
| `--muted-2` | `#A8A096` | Faint labels / placeholder |

### 2.3 Brand & accents (flag-derived)

| Token | Hex (light) | Role |
|---|---|---|
| `--gold` | `#FF9933` | **Primary (saffron)** — buttons, active states, key numbers |
| `--gold-deep` | `#E07B1F` | Primary hover / pressed, value text on tinted cards |
| `--gold-soft` | `#FFF3E6` | Saffron tint background, hover fill |
| `--gold-soft-2` | `#FDE7CC` | Stronger saffron tint (active nav, card border) |
| `--sage` | `#138808` | **Positive (India-green)** — success, profit, paid |
| `--sage-deep` | `#0E6606` | Green hover / value text |
| `--sage-soft` | `#E8F4E6` | Green tint background |
| `--sage-soft-2` | `#D6ECD2` | Stronger green tint (card border) |
| `--navy` | `#0A2472` | **Info (Chakra navy)** — collections, neutral KPIs, Chakra stroke |
| `--navy-deep` | `#000080` | Navy emphasis |
| `--navy-soft` | `#E6EAF6` | Navy icon-chip background |
| `--navy-text` | `#0A2472` | Navy value/label text |
| `--tomato` | `#C2402E` | Danger / negative / alerts |
| `--tomato-soft` | `#FBEAE6` | Danger tint background |
| `--terracotta` | `#C9794A` | Legacy tertiary accent (kept for back-compat) |
| `--terracotta-soft`| `#F1E0D2` | Legacy warning tint |

### 2.4 Semantic mapping

| Semantic | Token | Notes |
|---|---|---|
| Primary action | `--gold` | Saffron buttons / active nav |
| Success / credit / profit | `--sage` | Green stat card, recharges, positive P&L |
| Info / collections | `--navy` | Navy KPI cards, Chakra, neutral emphasis |
| Danger / debit-fail | `--tomato` | Failed scan, insufficient balance, void, sign-out |
| Neutral | `--ink-2` | Plain informational chips |

> **Status-dot legend:** sage = active/ok, gold (saffron) = highlight, navy = info,
> tomato = error. Reuse for cardholder status, menu availability, and transaction states.

---

## 3. CSS custom properties

The **live, authoritative** token block lives in [`app/globals.css`](app/globals.css) (`:root`,
`[data-theme="dark"]`, and the `@theme inline` mapping). The light values are reproduced here for
reference — if they ever differ, globals.css wins.

```css
:root {
  /* neutrals */
  --canvas: #fbf8f2;  --surface: #ffffff;     --surface-2: #fcfaf5;
  --tray: #fffcf6;    --tray-2: #fffefb;
  --line: #ece7dd;    --line-strong: #e2dcd0;

  /* text */
  --ink: #1c1a17;     --ink-2: #5a544b;
  --muted: #7c766c;   --muted-2: #a8a096;

  /* brand + accents (saffron→gold, green→sage, navy info, red danger) */
  --gold: #ff9933;    --gold-deep: #e07b1f;   --gold-soft: #fff3e6;  --gold-soft-2: #fde7cc;
  --sage: #138808;    --sage-deep: #0e6606;   --sage-soft: #e8f4e6;  --sage-soft-2: #d6ecd2;
  --navy: #0a2472;    --navy-deep: #000080;   --navy-soft: #e6eaf6;  --navy-text: #0a2472;
  --tomato: #c2402e;  --tomato-soft: #fbeae6;
  --terracotta: #c9794a; --terracotta-soft: #f1e0d2;

  /* typography */
  --font-display: var(--font-spline-sans), "Inter", system-ui, sans-serif;
  --font-body: var(--font-spline-sans), "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;
  --font-devanagari: var(--font-tiro-marathi), Georgia, serif;

  /* radius */
  --radius-pill: 999px;  --radius-lg: 20px;  --radius-md: 16px;  /* cards */
  --radius-sm: 10px;     /* nav items, fields, buttons */  --radius-xs: 8px;

  /* elevation (soft, diffuse) */
  --shadow-sm: 0 1px 2px rgba(28,26,23,.04), 0 4px 16px rgba(28,26,23,.05);
  --shadow-md: 0 4px 12px -2px rgba(28,26,23,.08), 0 12px 28px -10px rgba(28,26,23,.1);
  --shadow-lg: 0 30px 70px -24px rgba(28,26,23,.22);
  --shadow-gold: 0 2px 6px rgba(224,123,31,.3);
}
```

Brand helpers `.tricolour` (saffron/white/green rule) and `.chakra` (24-spoke Ashoka Chakra in
navy) are defined at the bottom of globals.css; the `<Chakra/>` component lives in
[`components/shell/icons.tsx`](components/shell/icons.tsx).

---

## 4. Typography

**Spline Sans** is the primary UI + display face (with **Inter** as the latin fallback);
**JetBrains Mono** is reserved for IDs, card numbers, balances, and timestamps (RFID data is
monospace by nature); **Tiro Devanagari Marathi** sets the Devanagari wordmark (`भोजन`). Loaded via
`next/font/google` in [`app/layout.tsx`](app/layout.tsx).

| Style | Family | Size / Line | Weight | Use |
|---|---|---|---|---|
| Display / H1 | Spline Sans | 27 / 1.1 | 700 | Page hero, big section title |
| H2 | Spline Sans | 16 / 1.3 | 700 | Card / panel titles |
| Body | Spline Sans | 14 / 1.45 | 400 | Default text |
| Small | Spline Sans | 12 / 1.4 | 500 | Captions, labels |
| Stat number | Spline Sans | 28 / 1.1 | 700 | The big KPI figures (tabular-nums) |
| Data / ID | JetBrains Mono | 13 / 1.4 | 500 | Card numbers, balances, codes |
| Wordmark (Devanagari) | Tiro Devanagari Marathi | — | 400 | `भोजन` in the brand block |

- Headings use `--ink`; supporting text uses `--muted`.
- Letter-spacing: tighten display (`-0.6px`); slightly loosen all-caps labels (`+0.06em`).
- All-caps micro-labels (sidebar section headers, table headers) in `--muted`/`--muted-2`, 11px, 600.
- Numbers in KPIs/tables use `font-variant-numeric: tabular-nums`.

---

## 5. Spacing, radius & layout

**Spacing scale** (4px base): `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
Default gutter between cards: **20–24px**. Card inner padding: **20–24px**. The design is airy —
when unsure, choose the larger step.

**Radius:** panels `--radius-lg`, cards `--radius-md`, inputs/buttons `--radius-sm`,
chips/pills `--radius-pill`.

**App shell layout** (mirrors the mockup):

```
┌──────────────────────────────────────────────────────────┐
│  --canvas backdrop                                         │
│   ┌────────────┬──────────────────────────────────────┐   │ ← floating panel
│   │  TRAY      │  SURFACE (white)                      │   │   radius-lg
│   │  (cream    │   • hero + KPI row (stat cards)       │   │   shadow-lg
│   │  sidebar)  │   • content grid (menu / bowls)       │   │
│   │  ~232px    │   • data rows / table                 │   │
│   └────────────┴──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

- Sidebar width: **232px** (keeps parity with the mock's `padding-left: 232px`).
- The whole panel floats on `--canvas` with `--shadow-lg`; on mobile (<760px) the tray
  collapses to a top bar and the panel goes edge-to-edge.

---

## 6. Component patterns

### 6.1 Sidebar (tray)
```css
.tray {
  background: linear-gradient(180deg, var(--tray-2) 0%, var(--tray) 100%);
  border-right: 1px solid var(--line);
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
}
.tray .section-label { color: var(--muted); font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase; }
.tray .nav-item { color: var(--ink-2); border-radius: var(--radius-sm); padding: 10px 12px; }
.tray .nav-item:hover { background: rgba(224,169,58,0.10); color: var(--gold-deep); }
.tray .nav-item.active { background: var(--gold-soft); color: var(--ink); }
```

### 6.2 Stat / KPI cards
Two flavors from the mockup — the **sage** card and the **gold** card — plus a plain white one.
```css
.stat { border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm); }
.stat .value { font-family: var(--font-display); font-size: 28px; font-weight: 600; }
.stat .label { color: var(--muted); font-size: 12px; }

.stat--sage  { background: var(--sage-soft);  color: var(--sage-deep); }
.stat--gold  { background: var(--gold-soft);  color: var(--gold-deep); }
.stat--plain { background: var(--surface-2);  color: var(--ink); border: 1px solid var(--line); }
```

### 6.3 Buttons
```css
.btn { border-radius: var(--radius-sm); padding: 10px 16px; font-weight: 600;
  font-family: var(--font-body); transition: transform var(--dur-fast) var(--ease),
  box-shadow var(--dur) var(--ease); }

.btn--primary { background: var(--gold); color: #fff; box-shadow: var(--shadow-gold); }
.btn--primary:hover { background: var(--gold-deep); transform: translateY(-1px); }

.btn--ghost { background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--line-strong); }
.btn--ghost:hover { border-color: var(--gold); color: var(--gold-deep); }

.btn--pill { border-radius: var(--radius-pill); }   /* the small tag-buttons in the mock */
```

### 6.4 Content cards (menu items / "bowls")
```css
.card { background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 20px; }
.card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.card .price { font-family: var(--font-mono); color: var(--gold-deep); font-weight: 600; }
```

### 6.5 Chips, badges & status dots
```css
.chip { border-radius: var(--radius-pill); padding: 4px 10px; font-size: 12px; font-weight: 600;
  background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--line); }

.badge--ok      { background: var(--sage-soft);       color: var(--sage-deep); }
.badge--pending { background: var(--terracotta-soft); color: var(--terracotta); }
.badge--fail    { background: var(--tomato-soft);     color: var(--tomato); }

.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot--ok { background: var(--sage); } .dot--hot { background: var(--gold); }
.dot--warn { background: var(--terracotta); } .dot--err { background: var(--tomato); }
```

### 6.6 Inputs (incl. the RFID scan field)
```css
.input { background: var(--surface-2); border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm); padding: 10px 12px; color: var(--ink);
  font-family: var(--font-body); }
.input:focus { outline: none; border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(224,169,58,0.18); }
.input--rfid { font-family: var(--font-mono); letter-spacing: 0.04em; }
```

### 6.7 Tables / transaction ledger
```css
.table th { background: var(--surface-2); color: var(--muted); font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.table td { border-bottom: 1px solid var(--line); color: var(--ink-2); }
.table td.num { font-family: var(--font-mono); color: var(--ink); text-align: right; }
.table tr:hover { background: rgba(224,169,58,0.05); }
```

---

## 7. Tailwind mapping

This project uses **Tailwind CSS v4** — there is **no `tailwind.config.{ts,js}`**. Tokens are
mapped to utilities via the `@theme inline { … }` block in [`app/globals.css`](app/globals.css)
(reproduced in §3), which exposes `--color-*`, `--font-*`, `--radius-*`, and `--shadow-*` so
`bg-surface`, `text-ink`, `bg-gold`, `text-navy-text`, `rounded-md`, `shadow-gold`, etc. all work.
Fonts are loaded with `next/font` in [`app/layout.tsx`](app/layout.tsx) (Spline Sans, Inter,
JetBrains Mono, Tiro Devanagari Marathi) and wired into the `--font-*` stacks.

Utilities available (names stable from the old system; values are the tricolour palette):
`bg-canvas/-surface/-surface-2/-tray/-tray-2`, `border-line/-line-strong`, `text-ink/-ink-2/-muted/-muted-2`,
`{bg,text,border}-gold[-deep|-soft|-soft-2]`, `…-sage[-deep|-soft|-soft-2]`, `…-navy[-deep|-soft]`/`text-navy-text`,
`…-tomato[-soft]`, `rounded-{xs,sm,md,lg,pill}`, `shadow-{sm,md,lg,gold}`, `font-display/-body/-mono/-devanagari`.

Usage example: `class="bg-surface rounded-md shadow-sm text-ink font-body"`,
primary button `class="bg-gold hover:bg-gold-deep text-white rounded-sm shadow-gold"`.

---

## 8. Accessibility & contrast

- **Body text** uses `--ink`/`--ink-2` on white → comfortably ≥ 7:1 and ≥ 5:1.
- `--muted` on white is ~3:1 — **use only for non-essential captions/labels**, never for content
  a user must read to act. Bump to `--ink-2` for anything functional.
- **Saffron (`--gold` #FF9933) buttons:** white text on saffron is ~1.9:1 — below AA for normal
  text. Per the product decision the primary buttons use **white text on saffron** to match the
  reference design (`BTN_PRIMARY`, Apply, Sign In, active settings tab, current-page pill); treat
  this as an accepted brand exception. Where contrast matters more (dense data, small labels on a
  saffron tint), prefer `--gold-deep` on `--gold-soft` (the stat-card / pill pattern), which is
  comfortably legible.
- Never signal state by **color alone** — pair status dots/badges with a label or icon
  (`● Active`, `● Failed`).
- Focus rings: the `0 0 0 3px rgba(gold,0.18)` glow plus a solid `--gold` border must remain on
  keyboard focus; don't remove outlines without a visible replacement.
- Honor `prefers-reduced-motion`: drop the `translateY` hovers and transitions.

---

## 9. Dark variant (parity)

Dark is a **manual user choice** — **not** the OS `prefers-color-scheme`. The Appearance toggle
lives both in the topbar ([`theme-control.tsx`](components/shell/theme-control.tsx) →
`ThemeToggleButton`) and the profile dropdown (`ThemeControl`), sharing one store; the choice is
persisted in `localStorage` under `theme` (default **Light**) and applied pre-paint by the inline
script in [`app/layout.tsx`](app/layout.tsx), which toggles `[data-theme="dark"]` on `<html>`. The
authoritative dark values live in [`app/globals.css`](app/globals.css) `[data-theme="dark"]` —
including the re-tuned neutrals (e.g. `--canvas: #161310`, `--surface: #211d18`), the bright-indigo
`--navy` (#6e8bff, since navy is invisible on dark), and brightened `--gold`/`--sage`. If values
here ever differ, globals.css wins.

---

## 10. Quick reference (cheat sheet)

| Need | Use |
|---|---|
| Page background | `--canvas` |
| Main panel | `--surface`, `--radius-lg`, `--shadow-lg` |
| Sidebar | `--tray`→`--tray-2` gradient |
| Primary button | `--gold` (saffron) bg, white text, `--shadow-gold` |
| Positive KPI / credit / profit | `--sage` (green) family |
| Info / collections | `--navy` family |
| Error / failed scan / danger | `--tomato` family |
| Headings | Spline Sans (`font-display`), `--ink` |
| Card numbers / balances | JetBrains Mono (`font-mono`), `--ink` |
| Captions | Spline Sans, `--muted`/`--muted-2` |
| Devanagari wordmark (भोजन) | Tiro Devanagari Marathi (`font-devanagari`) |
| Card radius / padding | `--radius-md` (16px) / 18–20px |
