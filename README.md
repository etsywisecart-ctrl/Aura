# Aura — a premium Shopify theme

Aura is an Online Store 2.0 Shopify theme built to a single, deliberate design
language: near‑monochrome, typographically led, generous with space, and quiet
in its motion. The goal is a store that feels like a considered object rather
than a template — restraint over decoration, at flagship‑product quality.

> **Design first.** The complete visual system was defined before a line of
> theme code. See [`design/design-language.html`](design/design-language.html)
> — a living document that embodies the language it specifies (open it in a
> browser; it has a light/dark toggle).

---

## The design language, in short

| Layer | Decision |
|------|----------|
| **Palette** | Porcelain `#F5F3EE` ground · Obsidian `#17181B` ink · a single restrained **champagne** accent `#C2A268` · a soft "aura" light‑glow as the signature |
| **Type** | System typeface for a native, flagship feel; three roles — structural sans, a serif reserved for rare editorial lines, mono for data. Tabular numerals throughout. |
| **Space** | 4pt base on an 8pt system; large vertical rhythm; content framed, never edge‑to‑edge |
| **Motion** | One easing signature — `aura-ease` `cubic-bezier(0.22,1,0.36,1)` — on a fixed 5‑step timing scale. Felt, never watched. |
| **Themes** | Full light **and** dark via color schemes |

Everything visible is composed from a small, fixed set of tokens in
[`assets/base.css`](assets/base.css). Designers compose from these; they don't
invent new values.

---

## What's included

**Templates** — home, product, collection, cart, search, blog, article, page,
contact, list‑collections, 404, password, gift card, and the full customer
account set (login, register, account, addresses, order, reset & activate).

**Sections** — image banner (hero), rich text, featured collection, collection
list, image‑with‑text, multicolumn, newsletter, product with a media gallery
and blocks (vendor / title / price / variant picker / buy buttons / description
/ collapsible rows / share), product recommendations, collection grid with
calm filters + sorting, cart, blog, article, search, contact, and the global
header / footer / announcement bar.

**Interactions** (vanilla JS web components, no framework — `assets/global.js`)

- Slide‑out **cart drawer** with AJAX add‑to‑cart and line‑item editing via the
  Section Rendering API
- **Sticky header** that hides on scroll‑down and returns on scroll‑up
- **Variant picker** with live price / availability / URL updates
- **Predictive search** in a drawer
- **Quantity** steppers, scroll‑reveal, image blur‑up, sticky mobile buy bar

Accessible by default: skip link, focus‑visible rings, focus trapping in
drawers, `aria` labelling, and full `prefers-reduced-motion` support.

---

## Project structure

```
assets/                  base.css (design system) · global.js (interactions)
config/                  settings_schema.json · settings_data.json
layout/                  theme.liquid · password.liquid
locales/                 en.default.json
sections/                page sections + header/footer/announcement groups
snippets/                card-product, card-collection, price, icon, pagination, …
templates/               JSON templates (+ customers/ Liquid templates)
.github/workflows/       theme-check.yml — CI lint on every push
.theme-check.yml         Theme Check config (theme-check:all)
shopify.theme.toml       CLI store environments
.shopifyignore           files the CLI must never upload
package.json             npm scripts wrapping the CLI
```

---

## Local development

Requires [Node 20+](https://nodejs.org) and the Shopify CLI.

```bash
npm install -g @shopify/cli@latest     # one time
```

Point the CLI at your store by editing `shopify.theme.toml`, replacing
`your-store.myshopify.com` with your myshopify domain. Then:

| Command | What it does |
|---|---|
| `npm run dev` | Live preview on a dev theme, hot-reloads on save |
| `npm run check` | Theme Check (the Theme Store ruleset) |
| `npm run push` | Push to the store — prompts for which theme |
| `npm run push:unpublished` | Push as a new unpublished theme |
| `npm run pull` | Pull theme-editor changes back down |
| `npm run share` | Upload and get a shareable preview link |
| `npm run package` | Build a distributable zip |

The first command opens a browser to authenticate against your store. After
that the CLI remembers the session.

`config/settings_data.json` is listed under `ignore` in `shopify.theme.toml`,
so pushing never overwrites the settings a merchant has saved in the editor.

### Deploying without the CLI

Shopify can sync a branch directly: **Online Store → Themes → Add theme →
Connect from GitHub**. Pick this repo and a branch, and every push to that
branch updates the theme — no zip, no CLI.

No build step — CSS and JS are authored directly and served as static assets.

## Customizing

- **Colors** — Theme editor → *Colors*. Four Aura schemes ship by default;
  each section chooses a scheme. The champagne accent is theme‑wide.
- **Typography** — Theme editor → *Typography*. Two roles: a display face for
  headlines and a text face for everything else, both from Shopify's font
  library so no third‑party font requests are made. Scale and weights are
  fixed by the design language.
- **Layout, cards, cart** — page width, grid spacing, card style/ratio, and
  cart type (drawer / page / notification) are all in Theme settings.

---

## Design review gate

Every screen is held against the same eight questions (see Phase 12 of the
design language). If any answer is "no", it goes back:

1. Does it feel premium and luxurious? 2. Timeless in five years? 3. Improves
the experience, not just the look? 4. Reduces friction? 5. Increases trust?
6. Does every element earn its place? 7. Faithful to the one system? 8. Would a
visitor mistake it for a flagship product, not a Shopify theme?
