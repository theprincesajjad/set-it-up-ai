---
name: appllama-usage
description: "Use for Mobbin research on native mobile apps (iOS/Android, Expo, React Native). Load after mobbin-design routes to mobile, or directly for mobile onboarding/paywall/checkout/tab flows. Hand off to appllama-app-design-skill. For websites and web apps, use mobbin-web-usage instead (or start at mobbin-design to route)."
license: MIT
metadata:
  author: Appllama (adapted for Mobbin MCP)
  version: 2.1.1
  routed_by: mobbin-design@1.0.0
  pairs_with:
    - appllama-app-design-skill@1.4.1
  web_counterpart:
    - mobbin-web-usage@1.0.0
    - mobbin-web-design@1.0.0
---

# Appllama Usage Skill (Powered by Mobbin MCP)

[Mobbin](https://mobbin.com) is the industry-standard design library of real-world mobile apps, web apps, and websites — 621,500+ production screens, multi-step flows, and UI sections. The **Mobbin MCP** (`https://api.mobbin.com/mcp`, exposed in Cursor as `plugin-mobbin-mobbin` / `mobbin`) puts that library directly in an agent's hands: **not just a research tool, a builder's tool.** You study what already wins in production, then you build something better.

**Entry:** Prefer starting at **`mobbin-design@1.0.0`** so mobile vs web is routed correctly. If you are already here, you are on the **mobile** track.

Pair this skill with **appllama-app-design-skill@1.4.1** for every **mobile** design and implementation step — this skill tells you what to study with Mobbin MCP; that one tells you how to build.

**Wrong track?** If the deliverable is a website, landing page, or browser SaaS UI, stop and load **`mobbin-web-usage@1.0.0`** → **`mobbin-web-design@1.0.0`** (or re-enter via `mobbin-design`).

## Ground rules (read first)

1. **Standard Search is 0 AI credits; Deep Search is 5 AI credits.**
   - `search_screens` with `mode: "standard"`, `search_flows`, `search_sections`, and all collection tools (`list_collections`, `get_collection_contents`, `create_collection`, `save_content`, `add_comment`) use **0 AI credits**.
   - `search_screens` with `mode: "deep"` uses **5 AI credits** per successful search (0 credits if a search returns no results or errors). Pro plans include 300 credits/month (60 Deep Searches); Team/Enterprise plans include 600 credits/member/month (120 Deep Searches).
   - Default to `mode: "standard"` and `search_flows` for broad discovery, app walkthroughs, and straightforward pattern lookups; spend `mode: "deep"` when you need nuanced, AI-scored intent or visual-language matching.
2. **Write specific, single-intent natural-language queries.**
   - Describe **one screen** in plain language — the UI elements you expect to see and how they relate.
   - **Good:** `"login screen with biometric authentication"`, `"checkout page with promo code field and Apple Pay button"`, `"habit tracker streak calendar and daily check-in"`.
   - **Avoid:** vague style words (`"modern login"`, `"clean checkout"`), negations (`"checkout without ads"`), disconnected keyword lists, or combining multiple intents (`"login or signup"` — run two separate searches instead).
   - **Target a specific app** by naming it in `query` (e.g. `"Spotify now-playing screen"`, `"Duolingo streak freeze screen"`).
   - **Never put `ios` or `web` in `query`** — always pass `platform: "ios"` or `platform: "web"` via the dedicated `platform` parameter.
3. **Go deep — walk flows and journeys, not isolated stills.**
   - Design language lives in the whole journey. Use `search_flows` to study multi-step sequences (onboarding, paywalls, checkout, core loops) and `search_screens` to drill into individual screens and UI elements.
4. **Media & image URLs.**
   - Every screen, flow, or section returned by Mobbin MCP includes an inline low-res preview sized for the agent to read immediately, plus a high-resolution `image.url` (`image_url`), `mobbin_url`, `app_name`, and `platform`.
   - Pass `image_quality: "high"` on `search_screens` when you need high-resolution images for detailed visual inspection.
   - Image URLs expire after **30 days** (`image.url_expires_at`). Download reference images into your local `research/` folder or save them to a Mobbin collection (`save_content`) so your shortlist is preserved.
5. **Pagination & deduplication via `exclude_screen_ids`.**
   - `search_screens` returns up to `limit` screens (default 20, max 100) and accepts `exclude_screen_ids` (up to 100 screen UUIDs). To page deeper on a query without seeing duplicates, pass previously returned screen `id`s in `exclude_screen_ids`.
6. **Rate limits (60 requests / 60 seconds).**
   - Mobbin MCP allows 60 requests per 60 seconds per user. If you hit `429 Too Many Requests`, respect the `Retry-After` header and wait before retrying.
7. **Start from the user's collections when they exist.**
   - Call `list_collections` at the start of a research pass. If the user already curated a collection on mobbin.com for the project or screen type, read it with `get_collection_contents` before running broad searches.

## Mobbin MCP Tool Map

| Tool | Credits | What it gives you | Typical use |
|---|---|---|---|
| `search_screens` | `0` (`mode="standard"`) / `5` (`mode="deep"`) | Screens matching natural-language `query` and `platform` (`"ios"` or `"web"`). Optional `mode` (`"standard"` \| `"deep"`), `limit` (1–100, default 20), `image_quality` (`"optimized"` \| `"high"`), `exclude_screen_ids`. Returns `id`, inline preview, `image.url`, `mobbin_url`, `app_name`, `platform`. | Gather screen & component references; filter by app name in `query`; pair `"standard"` (fast keyword/pattern match) with `"deep"` (AI intent/visual match) |
| `search_flows` | `0` | Multi-step user flows (onboarding, paywalls, checkout, core feature loops) with inline preview screens and app context. | Study end-to-end journeys, step counts, friction placement, and navigation presentation (push vs modal vs sheet) |
| `search_sections` | `0` | Website sections (heroes, pricing tables, feature grids, testimonials, FAQs, footers) with previews and `image_url`. | Research web desks, marketing pages, pricing layouts, and responsive web sections |
| `list_collections` | `0` | Lists "All saved" and the user's/workspace's Mobbin collections with item counts. | Check user curation at session start |
| `get_collection_contents` | `0` | Reads saved screens, flows, or sections inside "All saved" or a specific collection. | Study references the user already bookmarked on mobbin.com |
| `create_collection` | `0` | Creates a new Mobbin collection in the user's workspace. | Create a dedicated collection for the current app or feature build |
| `save_content` | `0` | Saves screens, flows, or sections into "All saved" or a collection. | Persist the best 5–10 reference screens/flows during research |
| `add_comment` | `0` | Adds a comment/note on a screen, flow, or section. | Record why a screen was chosen or which pattern to extract |

### Translating legacy Appllama MCP concepts to Mobbin MCP

| Appllama MCP concept | Mobbin MCP equivalent |
|---|---|
| `get_credits` | Not needed — Standard searches (`search_screens(mode="standard")`, `search_flows`, `search_sections`) and collection tools cost **0 credits**; only `search_screens(mode="deep")` uses 5 credits |
| `search_apps` / `get_app` | `search_flows` + `search_screens(platform="ios", mode="standard")` for the category; group top matches by `app_name` and `mobbin_url` |
| `list_app_screens` | `search_flows` for the app's journeys + `search_screens(query="<App Name> <flow or screen>", platform="ios", mode="standard")` |
| `search_screens(mode="keyword")` | `search_screens(query="...", platform="ios", mode="standard")` (0 credits) |
| `search_screens(mode="semantic")` | `search_screens(query="...", platform="ios", mode="deep")` (5 credits) |
| `get_screen` | `search_screens` with `image_quality="high"` for full-res inspection, or `mode="deep"` to find visually/conceptually similar screens |
| `list_flows` / `get_flow_apps` | `search_flows` with the flow name or category (e.g. `"habit tracker onboarding"`, `"subscription paywall"`) |
| `list_ui_elements` / `get_element_screens` | `search_screens` describing the UI component in natural language (e.g. `"bottom sheet filter with slider"`, `"segmented control on stats screen"`) + `search_sections` for web |
| `list_my_boards` / `get_board` | `list_collections` / `get_collection_contents` (plus `create_collection`, `save_content`, `add_comment`) |

## The playbooks

| Scenario | Reference |
|---|---|
| Build an app from scratch (e.g. "build me a habit tracker") | [references/build-from-scratch.md](references/build-from-scratch.md) |
| Make an existing screen better | [references/improve-a-screen.md](references/improve-a-screen.md) |
| Flow & element research; general research method | [references/research-methods.md](references/research-methods.md) |

Both build playbooks end the same way: **the simulator loop from
appllama-app-design-skill, repeated until you cannot find a flaw.** Research
without that loop is decoration.

## Local reference boards & Mobbin Collections

When you pull screens and flows for study, save the strongest picks to a Mobbin collection (`create_collection` + `save_content` + `add_comment`) AND mirror your working notes locally:

```
research/
  <category>/
    apps.md            # the shortlist: app_name, mobbin_url, key flows, verdicts
    <app-name>/
      screens.md       # per-screen notes: id, mobbin_url, flow, elements, colors
      img/             # downloaded high-res screens (from image.url), in journey order
    patterns.md        # cross-app synthesis: the category's design language
```

Download the screens from `image.url` as you study them — synthesis happens with the images
side by side, not from metadata alone. Screen `id`s and `mobbin_url` links are durable, and `image.url` links remain valid for 30 days.
