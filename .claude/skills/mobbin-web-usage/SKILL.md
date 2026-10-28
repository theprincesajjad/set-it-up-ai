---
name: mobbin-web-usage
description: "Use for Mobbin research on websites and web apps — web screens, web flows, and Mobbin Sites sections. Load after mobbin-design routes to web, or directly for landing pages, dashboards, pricing, heroes, footers. Hand off to mobbin-web-design. For native mobile, use appllama-usage instead."
license: MIT
metadata:
  author: customized from Appllama for Mobbin web
  version: "1.0.0"
  routed_by: mobbin-design@1.0.0
  hands_off_to:
    - mobbin-web-design@1.0.0
  pairs_with:
    - mobbin-web-design@1.0.0
  mobile_counterpart:
    - appllama-usage@2.1.1
    - appllama-app-design-skill@1.4.1
  mcp: "https://api.mobbin.com/mcp"
---

# Mobbin Web Usage Skill

[Mobbin](https://mobbin.com) is a searchable library of **real shipped** mobile apps, **web apps**, and **websites**. This skill is the research layer for web: how Mobbin **understands**, **looks at**, **analyzes**, and **exposes** web products through the Mobbin MCP (`https://api.mobbin.com/mcp`).

**Entry:** Prefer starting at **`mobbin-design@1.0.0`** so mobile vs web is routed correctly. If you are already here, you are on the **web** track.

**Pairing rule:** This skill tells you *what to study* and *how to query*. For *how to design and ship* the site or web app from those references, load **`mobbin-web-design@1.0.0`**. Never design a web surface from imagination when Mobbin MCP is connected.

**Wrong track?** Native mobile (Expo / RN / iOS) → **`appllama-usage@2.1.1`** → **`appllama-app-design-skill@1.4.1`**.

```
User asks for web UI
        │
        ▼
┌─────────────────────┐
│  mobbin-web-usage   │  ← YOU ARE HERE (research)
│  search → analyze   │
│  → shortlist        │
└─────────┬───────────┘
          │ handoff: refs + patterns.md
          ▼
┌─────────────────────┐
│  mobbin-web-design  │  motion · flow · look ·
│  build + verify     │  language · type · psychology
└─────────────────────┘
```

---

## 1. How Mobbin understands web

Mobbin does **not** treat “the web” as one blob. It splits web into three corpora with different jobs:

| Corpus | What it is | MCP tool | Identity field | Typical ask |
|---|---|---|---|---|
| **Web app screens** | Full desktop (or wide) captures of product UI — dashboards, settings, editors, tables, dialogs | `search_screens` with `platform: "web"` | `app_name` | “How do SaaS tools layout analytics?” |
| **Web app flows** | Ordered multi-step journeys inside web products — checkout, subscribe, onboarding, account setup | `search_flows` with `platform: "web"` | `app_name`, `actions[]`, `screen_count` | “How does web SaaS run plan upgrade?” |
| **Website sections (Mobbin Sites)** | Marketing / public-page **slices** — Hero, Features, Pricing, FAQ, Footer, Social Proof, etc. | `search_sections` (web-only; no platform param) | `site_name` | “How do AI tools write a pricing section?” |

### Historical split (why this matters)

- **Web apps** = logged-in / product chrome: sidebars, command palettes, dense tables, billing settings, multi-pane editors.
- **Mobbin Sites** (launched Aug 2025) = public-facing marketing pages: landing pages, portfolios, shopfronts, campaign microsites — catalogued as **sections** and **styles** (Brutalist, Editorial, Minimal, Bold Typography, …), not only as full-page screenshots.

When the user says “website” or “landing page”, prefer **`search_sections`**. When they say “web app”, “dashboard”, “admin”, or “SaaS product UI”, prefer **`search_screens` + `search_flows` with `platform: "web"`**. Many real builds need **both** (marketing site + product app).

### What Mobbin encodes on each item

From MCP results and collection reads:

- **Screens** → `screen_patterns`, `ui_elements`, `app_name`, `platform`, `mobbin_url`, preview + `image_url`
- **Flows** → ordered screens, `actions` (e.g. “Subscribing & Upgrading”), `screen_count`, `app_name`
- **Sections** → `section_patterns`, `site_name`, `mobbin_url`, preview + `image_url`

Treat metadata as **index**, not truth. **Always examine the inline preview images** before describing or deciding. Do not summarize from `app_name` / `site_name` alone.

---

## 2. How Mobbin looks at web apps & sites

### Capture grammar

1. **Desktop-first framing.** Web screens and sections are wide canvases. Read **chrome** (nav, sidebar, breadcrumbs, sticky footers), not only the hero card in the middle.
2. **Curator bar.** Captures often include a Mobbin footer (“curated by Mobbin”) with the product logo — ignore that strip as product UI; it is library chrome.
3. **Flow as filmstrip.** `search_flows` returns evenly spaced previews (typically 3 inline) across the journey. Reconstruct the story: entry → commitment → payment/confirm → return to product.
4. **Section as unit of marketing.** Sites are sliced by **job** (Hero sells the promise; Pricing commits; FAQ handles objection; Footer orients). Do not treat a hero crop as “the whole site.”
5. **Style tags on Sites.** Styles (Minimal, Brutalist, Editorial, …) describe visual attitude. Use them in natural-language queries when the user named a look (“editorial fashion landing hero”).

### What to look *for* when you open a preview

For **web app screens**:

- Information architecture: sidebar vs top-nav vs dual-nav; where global search lives
- Density: carded whitespace vs data-dense tables
- Hierarchy: page title, primary CTA, secondary actions, tertiary menus
- State: empty, trial banners, upgrade badges, errors, disabled CTAs
- Trust & risk: security copy near payment, plan inclusions, tax transparency

For **website sections**:

- One job of the section (promise, proof, plan, path)
- Type scale and contrast between headline / support / CTA
- CTA grammar (single primary vs primary+secondary; email capture vs free trial)
- Proof devices (logos, stats, avatars on demo buttons, quotes)
- Atmosphere (photo, product UI mock, pattern, motion cue, 3D)

---

## 3. How Mobbin analyzes them (and how you should)

Mobbin’s library analysis is **pattern + element + action** tagging over real captures. Your job as the agent is to turn that into a **designable spec**, not a mood board.

### Analysis checklist (run on every shortlisted item)

1. **Name the pattern** — e.g. “two-column hero with email capture”, “settings L-nav + sticky billing CTA”, “checkout two-pane form + order summary”.
2. **Extract layout skeleton** — columns, sticky regions, max-width, grid vs stack.
3. **Extract type & language** — display vs body; benefit-led vs feature-led copy; CTA verbs (“Get started” vs “Subscribe and pay”).
4. **Extract color & material** — neutrals family; one accent for money actions; card vs flat surfaces; border vs shadow elevation.
5. **Extract psychology** — urgency (trial days left), anchoring (struck prices), trust (secure payment banner), progressive disclosure (upgrade locks), friction removal ($0 due today).
6. **Extract motion cues** (even from stills) — carousels, play buttons, scroll-hint sections, sticky CTAs imply interaction; note them for `mobbin-web-design` motion laws.
7. **Cite** — markdown link each kept item to its `mobbin_url`.

### Cross-app method (non-negotiable)

- One product = taste. **Five products** = category grammar.
- Convergence across winners = convention (break only knowingly).
- Divergence = a real product choice (document it in `patterns.md`).

### Evidence vs inference

Mobbin shows **what shipped**, not that a pattern “converted better.” Say: “Stripe-like checkout places summary sticky-right” (observation), not “sticky summaries increase conversion 12%” (invention).

---

## 4. Searching

### Ground rules

1. **`platform` is a parameter, never a query word.** Use `platform: "web"` on screens/flows. Never put `web` / `ios` inside `query`.
2. **One intent per call.** Split “login or signup”, “hero and pricing” into separate searches.
3. **Name the product kind** in the query (`"SaaS"`, `"developer tool"`, `"ecommerce"`, `"banking"`) when the user implies one.
4. **Name a specific product** to filter (`"Linear settings billing"`, `"Stripe pricing section"`).
5. **Avoid vibe-only words** alone (`"modern"`, `"clean"`, `"beautiful"`) — pair with concrete UI.
6. **Credits:** `search_screens(mode="standard")`, `search_flows`, `search_sections`, and all collection tools = **0 AI credits**. `search_screens(mode="deep")` = **5 credits** (AI intent scoring). Default `standard`; spend `deep` for nuanced visual/intent matching.
7. **Always pass** stable `task_intent` (same English sentence for the whole task) and correct `output_destination` (`code` when building in a repo, `design_tool`, `doc`, `chat`, …).
8. **Cite** every presented item with a markdown link to `mobbin_url`. Show any `ai_usage_notice.text` verbatim after results.
9. **Images:** inline previews are for *you*; download `image_url` for export/embed (URLs expire ~30 days).

### Tool chooser

```
Need a marketing slice (hero, pricing, FAQ, footer, social proof)?
  → search_sections

Need a product screen (dashboard, settings, table, dialog, empty state)?
  → search_screens platform=web  (standard first)

Need a multi-step journey (checkout, subscribe, onboarding, invite)?
  → search_flows platform=web

User already saved refs on Mobbin?
  → list_collections → get_collection_contents
    (platform=web for screens/flows; sections ignore platform)
```

### Query craft — screens (`platform: "web"`)

| Good | Why |
|---|---|
| `"SaaS analytics dashboard with sidebar and date range filter"` | Product kind + screen job + concrete chrome |
| `"billing settings with trial banner and plan add-ons"` | State + objects |
| `"checkout page with promo code and order summary"` | Flow-critical UI |
| `"Notion-style settings members table"` | Named product as filter |

| Avoid | Why |
|---|---|
| `"modern clean dashboard"` | Vibe-only |
| `"web SaaS login or signup"` | Platform in query + dual intent |
| `"dashboard with charts and sidebar and dark mode and command palette and …"` | Over-constrained; start broad, then narrow |

**Modes:** start `mode: "standard"`. Follow with `mode: "deep"` when standard misses the visual relationship you need. Deduplicate deeper pages with `exclude_screen_ids`.

### Query craft — flows (`platform: "web"`)

| Good | Avoid |
|---|---|
| `"SaaS checkout with payment method selection"` | `"onboarding with goals and reminders and team invite"` (too many steps forced) |
| `"developer tool invite teammate"` | combining two journeys in one query |
| `"Pipedrive purchase a plan"` | vague `"upgrade flow"` with no product kind |

Study `actions`, step count, and presentation (full page vs modal vs multi-pane).

### Query craft — sections (Sites)

| Good | Avoid |
|---|---|
| `"AI tools pricing section"` | `"pricing section with cards and annual toggle and FAQ"` (split) |
| `"hero section with signup form"` | `"modern minimal hero"` alone |
| `"footer with newsletter and status links"` | multiple section types in one query |
| `"brutalist portfolio hero"` | — style word OK when user asked for that look |

Common section intents: Hero, Features, How It Works, Pricing, Comparison, Social Proof / Testimonials, Stats, FAQ, CTA, Newsletter, About, Blog, Contact, Footer, 404, Navigation.

### Limits & pagination

- Screens/sections: default ~20, max 30 per call; use `exclude_screen_ids` on screens to dig deeper.
- Flows: keep `limit` low (default 5, max 10) — each flow inlines multiple previews.
- Rate limit: ~60 requests / 60s; honor `Retry-After` on 429.

---

## 5. Collections & commenting

| Tool | Use |
|---|---|
| `list_collections` | Start of research — honor user curation |
| `get_collection_contents` | Read screens / flows / sections (`platform` required for screens & flows) |
| `create_collection` | Project board for this build |
| `save_content` | Persist shortlist (also lands in All saved) |
| `add_comment` | Why this ref matters — only when user wants notes on Mobbin |

Collection names are not unique — disambiguate before fetching. Private collection URLs are teammate-only; say so when sharing.

When reading collections: screens expose `screen_patterns` + `ui_elements`; sections expose `section_patterns`; flows expose `actions`. Use those to filter (e.g. only login screens, only Airbnb) — don’t dump every save into the build.

---

## 6. Local research board

Mirror Mobbin shortlists locally so synthesis survives expired image URLs:

```
research/web/<category>/
  apps.md              # shortlist: app_name/site_name, mobbin_url, verdict
  patterns.md          # category grammar + psychology + type notes
  <product>/
    screens.md         # id, mobbin_url, job, layout, type, CTA, notes
    flows.md           # step spine + presentation grammar
    sections.md        # section job + style tags observed
    img/               # downloaded image_url files
```

---

## 7. Playbooks

| Scenario | Reference |
|---|---|
| Research methods (search → analyze → synthesize) | [references/how-mobbin-sees-web.md](references/how-mobbin-sees-web.md) |
| Build a marketing site / landing page from scratch | [references/build-marketing-site.md](references/build-marketing-site.md) |
| Build a web app (SaaS / dashboard) from scratch | [references/build-web-app.md](references/build-web-app.md) |
| Improve an existing page or screen | [references/improve-a-page.md](references/improve-a-page.md) |

Every playbook ends by handing off to **`mobbin-web-design`**: implement, then run the browser verification loop until you cannot find a flaw.

---

## 8. Handoff contract → mobbin-web-design

Before writing UI code, produce:

1. **Shortlist** — 5–10 cited `mobbin_url`s (mix of sections and/or screens/flows as needed)
2. **`patterns.md`** — layout skeletons, type/font cues, color/material, motion cues, copy/CTA language, psychology devices
3. **Page/screen map** — ordered sections or routes with one job each
4. **Open choices** — where winners diverge, and which side you picked (and why)

Then invoke **`mobbin-web-design@1.0.0`**.
