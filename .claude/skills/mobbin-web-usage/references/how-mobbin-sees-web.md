# How Mobbin sees web — deep reference

## Three lenses on the same internet

```
                    ┌──────────────────────┐
                    │   Real shipped web   │
                    └──────────┬───────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
   Web app SCREENS      Web app FLOWS       SITE SECTIONS
   (product UI)         (journeys)          (marketing slices)
   platform=web         platform=web        search_sections
   app_name             app_name+actions    site_name
   screen_patterns      ordered screens     section_patterns
   ui_elements                              (+ style language)
```

### Lens A — Web screens

Mobbin looks at **product surfaces**: the chrome users live in after login.

Typical patterns you will see tagged or implied:

- Shell: sidebar + top bar, top-only nav, dual pane, canvas + inspector
- Data: tables, cards grids, charts, filters, empty states
- Overlays: dialogs, drawers, command palettes, toasts
- Account: settings hubs, billing, members, API keys

**How to analyze a screen image:**

1. Trace the **nav graph** (what’s global vs page-local).
2. Find the **primary action** (color, size, sticky position).
3. Note **density** and **grouping** (cards vs flat list vs table).
4. Spot **state messaging** (trial, upgrade, errors, empty).
5. Record **type roles** (page title, section label, meta, tabular nums).

### Lens B — Web flows

Mobbin looks at **time**: ordered captures of one job (purchase, subscribe, reset password, invite).

Metadata that matters:

- `name` — human flow title (“Purchase a plan”)
- `actions` — taxonomy labels (“Subscribing & Upgrading”)
- `screen_count` — length of the spine
- per-screen previews — the actual filmstrip

**How to analyze a flow:**

1. Chart the spine: entry → configure → commit → confirm → return.
2. Mark friction that is **intentional** (terms checkbox, address confirmation) vs **accidental** (dead ends).
3. Note presentation: full-page checkout vs modal; sticky summary vs inline.
4. Capture psychology devices per step (anchoring, $0 today, secure-payment banner, included add-ons).
5. Record what **back** means at each step (edit payment vs abandon).

### Lens C — Website sections (Mobbin Sites)

Mobbin looks at **marketing composition** as reusable sections, filterable by section type and visual style.

Section jobs (use these words in queries):

| Section | Job |
|---|---|
| Hero / Above the fold | Promise + primary path |
| Features / How it works | Mechanism |
| Social proof / Testimonials / Stats | Belief |
| Pricing / Comparison / Packages | Commitment framing |
| FAQ | Objection handling |
| CTA / Newsletter | Re-ask |
| Nav / Footer | Orientation |
| About / Blog / Contact | Depth & trust |
| 404 | Recovery with brand voice |

Styles you can invoke in queries when the user wants a look: Minimal, Brutalist, Editorial, Bold Typography, Colorful, Dark, Flat, Glass, Motion-forward, etc. (browse `mobbin.com/explore/sites/styles` for the live set).

**How to analyze a section image:**

1. One sentence: “This section’s only job is ___.”
2. Headline formula (outcome / provocation / specificity).
3. Support sentence length and concreteness.
4. CTA count and verb strength; secondary path?
5. Proof attached to the ask (logos, avatars, numbers).
6. Visual anchor (product UI, photo, illustration, typography-only).
7. Implied motion (play control, carousel arrows, scroll scene).

---

## Search playbooks by question type

| Question | First tool | Follow-up |
|---|---|---|
| “What should our landing hero feel like?” | `search_sections` | 2–3 more section types (proof, pricing) |
| “How do web apps structure billing?” | `search_flows` platform=web | `search_screens` on pivotal steps |
| “How dense should our analytics home be?” | `search_screens` platform=web | `mode=deep` if visual density matching fails |
| “Show me brutalist portfolio sites” | `search_sections` query includes style | Save to collection |
| “User already saved refs” | `list_collections` | `get_collection_contents` |

---

## Synthesis template (`patterns.md`)

```markdown
# Patterns — <category>

## Table stakes (every winner)
- …

## Edges (only the best)
- …

## Openings (what all of them do badly)
- …

## Layout skeletons we will reuse
- Marketing: …
- App shell: …

## Type & language
- Display cue: …
- Body cue: …
- CTA verbs locked: …

## Color & material
- Neutrals: warm|cool
- Accent (one): …
- Elevation: border|shadow|flat

## Motion cues observed
- …

## Psychology devices to keep
- …

## Citations
- [Product — screen/section](https://mobbin.com/…)
```
