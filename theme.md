# Theme — "Warm Cafeteria" Design System

> Derived from the reference dashboard mockup (cream sidebar / white canvas / golden-amber
> primary / sage-green + gold stat cards, food-forward warmth).
> Target stack: **Next.js (App Router) + Tailwind CSS**. Tokens are exposed as CSS custom
> properties so they work in plain CSS *and* map cleanly into `tailwind.config`.
>
> This is a **light-first, warm** system — a deliberate departure from the dark lime mock in
> [`base-theme.css`](base-theme.css). Where both exist, this file is the source of truth for the
> production UI's look; a dark variant is provided at the end for parity.

---

## 1. Design language (what the image is "saying")

The mockup reads as **appetizing, calm, and premium-casual** — the visual vocabulary of a modern
food/cafeteria product, not an enterprise admin panel.

| Trait | How it shows up | Implication for our UI |
|---|---|---|
| **Warm neutrals** | Cream sidebar, off-white canvas, no pure-cold grays | Backgrounds carry a slight yellow warmth; avoid `#fff`-on-`#000` clinical contrast |
| **Soft & rounded** | Big panel ~24px radius, cards ~16–20px, pill buttons/tags | Generous `border-radius` everywhere; nothing is a sharp rectangle |
| **Diffuse elevation** | Wide, low-opacity shadows; the whole panel "floats" | Soft shadows, no hard 1px drop shadows; depth via blur not borders |
| **Food-forward accents** | Sage green, gold, terracotta, tomato-red dots | A small, warm, food-derived accent palette — not primary-blue tech |
| **Airy density** | Lots of whitespace between rows, cards, and bowls | Comfortable spacing scale; let content breathe |
| **Quiet typography** | Dark charcoal headings, muted warm-gray body | High-contrast headlines, low-contrast supporting text |

**One-line mood:** *clean white plate, warm cream tray, a touch of gold.*

---

## 2. Color palette

### 2.1 Core neutrals (warm)

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#D7D9DD` | App backdrop behind the floating panel (cool light gray) |
| `--surface` | `#FFFFFF` | Main content surface / white "plate" |
| `--surface-2` | `#FDFBF6` | Subtly warm raised surface (inner cards on white) |
| `--tray` | `#F7F0DA` | Sidebar / "tray" base (warm cream) |
| `--tray-2` | `#FBF6E8` | Sidebar gradient top (lighter cream) |
| `--line` | `#ECE6D6` | Hairline borders on warm surfaces |
| `--line-strong` | `#DED7C2` | Stronger divider / input border |

### 2.2 Text (warm charcoal → muted)

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#2A2A28` | Headings, primary text (near-black, warm) |
| `--ink-2` | `#5A574F` | Secondary text |
| `--muted` | `#9C988C` | Captions, hints, inactive labels |
| `--muted-2` | `#BCB8AC` | Disabled / placeholder |

### 2.3 Brand & accents (food-derived)

| Token | Hex | Role |
|---|---|---|
| `--gold` | `#E0A93A` | **Primary** — buttons, active states, key numbers |
| `--gold-deep` | `#C8902A` | Primary hover / pressed |
| `--gold-soft` | `#F6E4B8` | Gold tint backgrounds, the gold stat card fill |
| `--sage` | `#7FA88C` | **Secondary** — success-ish stat card, positive deltas |
| `--sage-deep` | `#5F8B6E` | Sage hover / text-on-sage darkening |
| `--sage-soft` | `#DCE8DF` | Sage tint backgrounds |
| `--tomato` | `#D45A4A` | Danger / negative delta / alerts |
| `--tomato-soft` | `#F6DAD4` | Danger tint background |
| `--terracotta` | `#C9794A` | Tertiary accent / category dot / warnings |
| `--terracotta-soft`| `#F1E0D2` | Warning tint background |

### 2.4 Semantic mapping

| Semantic | Token | Notes |
|---|---|---|
| Primary action | `--gold` | The amber buttons in the mock |
| Success / credit | `--sage` | Green stat card; wallet top-ups, paid status |
| Warning / pending | `--terracotta` | Pending coupon, low-balance nudge |
| Danger / debit-fail | `--tomato` | Failed scan, insufficient balance, void |
| Info / neutral | `--ink-2` | Plain informational chips |

> **Status-dot legend** (the small colored dots in the mockup): sage = active/ok,
> gold = highlight, terracotta = attention, tomato = error. Reuse these for menu-item
> availability and transaction states.

---

## 3. CSS custom properties (drop-in)

```css
:root {
  /* neutrals */
  --canvas: #d7d9dd;
  --surface: #ffffff;
  --surface-2: #fdfbf6;
  --tray: #f7f0da;
  --tray-2: #fbf6e8;
  --line: #ece6d6;
  --line-strong: #ded7c2;

  /* text */
  --ink: #2a2a28;
  --ink-2: #5a574f;
  --muted: #9c988c;
  --muted-2: #bcb8ac;

  /* brand + accents */
  --gold: #e0a93a;
  --gold-deep: #c8902a;
  --gold-soft: #f6e4b8;
  --sage: #7fa88c;
  --sage-deep: #5f8b6e;
  --sage-soft: #dce8df;
  --tomato: #d45a4a;
  --tomato-soft: #f6dad4;
  --terracotta: #c9794a;
  --terracotta-soft: #f1e0d2;

  /* typography */
  --font-display: "Fraunces", "Georgia", serif;
  --font-body: "Inter Tight", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* radius */
  --radius-pill: 999px;
  --radius-lg: 24px;   /* main panel */
  --radius-md: 18px;   /* cards */
  --radius-sm: 12px;   /* inputs, small cards */
  --radius-xs: 8px;    /* chips, tight elements */

  /* elevation (soft, diffuse) */
  --shadow-sm: 0 2px 8px -2px rgba(58, 50, 30, 0.08);
  --shadow-md: 0 12px 28px -10px rgba(58, 50, 30, 0.12);
  --shadow-lg: 0 30px 70px -24px rgba(58, 50, 30, 0.20);
  --shadow-gold: 0 10px 24px -8px rgba(224, 169, 58, 0.40);

  /* motion */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms;
  --dur: 200ms;
}
```

---

## 4. Typography

The display serif (**Fraunces**) carries the warm/editorial feel; **Inter Tight** keeps the UI
crisp; **JetBrains Mono** is reserved for IDs, card numbers, balances, and timestamps (RFID data
is monospace by nature). This matches the font stack already loaded in
[`base-theme.css`](base-theme.css), so no new font requests.

| Style | Family | Size / Line | Weight | Use |
|---|---|---|---|---|
| Display | Fraunces | 32 / 1.1 | 600 | Page hero, big section title |
| H1 | Fraunces | 24 / 1.2 | 600 | Card / panel titles |
| H2 | Inter Tight | 18 / 1.3 | 600 | Sub-section headers |
| Body | Inter Tight | 14 / 1.5 | 400 | Default text |
| Small | Inter Tight | 12 / 1.4 | 500 | Captions, labels |
| Stat number | Fraunces | 28 / 1.0 | 600 | The big KPI figures |
| Data / ID | JetBrains Mono | 13 / 1.4 | 500 | Card numbers, balances, codes |

- Headings use `--ink`; supporting text uses `--muted`.
- Letter-spacing: tighten display (`-0.02em`); slightly loosen all-caps labels (`+0.06em`).
- All-caps micro-labels (sidebar section headers, table headers) in `--muted`, 11px, 600.

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

In `tailwind.config.{ts,js}`, point Tailwind at the CSS variables so utilities and tokens stay
in sync (set the variables in your global stylesheet per §3):

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        canvas:    "var(--canvas)",
        surface:   { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        tray:      { DEFAULT: "var(--tray)", 2: "var(--tray-2)" },
        line:      { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        ink:       { DEFAULT: "var(--ink)", 2: "var(--ink-2)" },
        muted:     { DEFAULT: "var(--muted)", 2: "var(--muted-2)" },
        gold:      { DEFAULT: "var(--gold)", deep: "var(--gold-deep)", soft: "var(--gold-soft)" },
        sage:      { DEFAULT: "var(--sage)", deep: "var(--sage-deep)", soft: "var(--sage-soft)" },
        tomato:    { DEFAULT: "var(--tomato)", soft: "var(--tomato-soft)" },
        terracotta:{ DEFAULT: "var(--terracotta)", soft: "var(--terracotta-soft)" },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body:    ["Inter Tight", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "8px", sm: "12px", md: "18px", lg: "24px", pill: "999px",
      },
      boxShadow: {
        sm:   "0 2px 8px -2px rgba(58,50,30,0.08)",
        md:   "0 12px 28px -10px rgba(58,50,30,0.12)",
        lg:   "0 30px 70px -24px rgba(58,50,30,0.20)",
        gold: "0 10px 24px -8px rgba(224,169,58,0.40)",
      },
      transitionTimingFunction: { soft: "cubic-bezier(0.22,1,0.36,1)" },
    },
  },
}
```

Usage example: `class="bg-surface rounded-md shadow-sm text-ink font-body"`,
primary button `class="bg-gold hover:bg-gold-deep text-white rounded-sm shadow-gold"`.

---

## 8. Accessibility & contrast

- **Body text** uses `--ink`/`--ink-2` on white → comfortably ≥ 7:1 and ≥ 5:1.
- `--muted` on white is ~3:1 — **use only for non-essential captions/labels**, never for content
  a user must read to act. Bump to `--ink-2` for anything functional.
- **Gold buttons:** `--gold` (#E0A93A) under white text is ~2.0:1 — **not** AA for normal text.
  Use white text on gold only at **≥16px bold** (large-text threshold), or prefer `--ink` text on
  gold for small labels. For the primary CTA, `--gold-deep` + white text gets closer; verify in
  context.
- Never signal state by **color alone** — pair status dots/badges with a label or icon
  (`● Active`, `● Failed`).
- Focus rings: the `0 0 0 3px rgba(gold,0.18)` glow plus a solid `--gold` border must remain on
  keyboard focus; don't remove outlines without a visible replacement.
- Honor `prefers-reduced-motion`: drop the `translateY` hovers and transitions.

---

## 9. Dark variant (parity)

Dark is a **manual user choice** via the Appearance toggle in the profile dropdown
(`components/shell/theme-control.tsx`), persisted in `localStorage` under `theme` (default
**Light**). The inline script in `app/layout.tsx` reads that choice and sets/removes
`[data-theme="dark"]` before first paint. Keep the warm hue family but invert surfaces under
`[data-theme="dark"]`:

```css
[data-theme="dark"] {
  --canvas: #16140f;
  --surface: #201d17;
  --surface-2: #272219;
  --tray: #1b1812;
  --tray-2: #221e16;
  --line: #342e22;
  --line-strong: #463e2d;
  --ink: #f1ece0;
  --ink-2: #c4bdac; /* warm light gray */
  --muted: #8f897a;
  --muted-2: #6c6658;
  /* accents keep their hue; soft tints get darker, lower-alpha equivalents */
  --gold-soft: rgba(224,169,58,0.16);
  --sage-soft: rgba(127,168,140,0.16);
  --tomato-soft: rgba(212,90,74,0.16);
  --terracotta-soft: rgba(201,121,74,0.16);
  --shadow-sm: 0 2px 8px -2px rgba(0,0,0,0.4);
  --shadow-md: 0 12px 28px -10px rgba(0,0,0,0.5);
  --shadow-lg: 0 30px 70px -24px rgba(0,0,0,0.6);
}
```

> The existing dark lime theme in [`base-theme.css`](base-theme.css) is a separate, older
> direction. This warm system is the default; light vs. dark follows the OS, not a user switch.

---

## 10. Quick reference (cheat sheet)

| Need | Use |
|---|---|
| Page background | `--canvas` |
| Main panel | `--surface`, `--radius-lg`, `--shadow-lg` |
| Sidebar | `--tray`→`--tray-2` gradient |
| Primary button | `--gold` bg, white/`--ink` text, `--shadow-gold` |
| Positive KPI / credit | `--sage` family |
| Pending / warning | `--terracotta` family |
| Error / failed scan | `--tomato` family |
| Headings | Fraunces, `--ink` |
| Card numbers / balances | JetBrains Mono, `--ink` |
| Captions | Inter Tight, `--muted` |
| Card radius / padding | `--radius-md` / 20–24px |
