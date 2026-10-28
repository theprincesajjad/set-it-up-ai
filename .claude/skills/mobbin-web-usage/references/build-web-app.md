# Playbook: build a web app (SaaS / product UI) from Mobbin web

Use when the user wants a dashboard, admin, editor, settings, billing UI, or other logged-in web product.

## Phase 1 — Collections first

`list_collections` → `get_collection_contents` with `content_type: "screens"` or `"flows"` and `platform: "web"`.

## Phase 2 — Find category winners

1. `search_flows` (`platform: "web"`) for core journeys:
   - `"<category> onboarding"` / `"creating account"`
   - `"<category> checkout"` / `"subscribing & upgrading"`
   - category signature flows (invite, publish, import, …)
2. `search_screens` (`platform: "web"`, `mode: "standard"`) for shell + home:
   - `"<category> dashboard with sidebar navigation"`
   - `"<category> settings billing"`
   - `"<category> empty state with primary create action"`
3. Shortlist **top 5** `app_name`s that recur. Record in `apps.md`. Optionally `create_collection` + `save_content`.

## Phase 3 — Walk flows + screens

For each shortlisted app:

- `search_flows` with `"<App> <journey>"`
- `search_screens` with `"<App> <screen>"`, `exclude_screen_ids` to page
- Use `mode: "deep"` only on pivotal screens when standard is weak

Extract:

- App shell grammar (nav, search, primary create)
- Home information hierarchy
- Empty / loading / error treatments
- Billing & upgrade psychology
- Presentation grammar (full page vs modal vs drawer)

## Phase 4 — Spec

From `patterns.md`, write routes + navigation map:

- What each route *is* (page, modal route, drawer, dialog)
- What browser back does
- One-way doors (post-purchase, finished onboarding)

## Phase 5 — Handoff + build

Invoke **`mobbin-web-design@1.0.0`**. Build route by route; verify in a real browser at desktop and mobile widths; screen-record critical flows.
