# Playbook: build a marketing site / landing page from Mobbin Sites

Use when the user wants a website, landing page, portfolio, campaign page, or marketing site.

## Phase 1 — Collections first

1. `list_collections`
2. If a relevant board exists, `get_collection_contents` with `content_type: "sections"` (and screens/flows if they also saved web product UI).
3. Treat user saves as **requirements**, not suggestions.

## Phase 2 — Section spine research

Run separate `search_sections` calls (0 credits) for each job you need, e.g.:

- `"<category> hero section with primary CTA"`
- `"<category> social proof logo bar"`
- `"<category> features section"`
- `"<category> pricing section"`
- `"<category> FAQ section"`
- `"<category> footer with newsletter"`

If the user named a **style**, include it: `"editorial fashion hero"`, `"brutalist agency portfolio hero"`.

Shortlist **3–5 sites** that appear across strong sections (`site_name` + `mobbin_url`). Save winners with `create_collection` + `save_content`.

## Phase 3 — Frame-by-frame on the top 3

For each shortlisted site:

1. Pull its key sections (hero → proof → mechanism → pricing → FAQ → CTA → footer).
2. Download `image_url` into `research/web/<category>/<site>/img/`.
3. Fill `sections.md`: one job, type cues, CTA language, proof devices, motion cues.
4. `add_comment` only if the user wants notes on Mobbin.

Write `patterns.md` (see how-mobbin-sees-web.md template).

## Phase 4 — Page map

Produce an ordered section list. **Hero budget:** brand, one headline, one support line, one CTA group, one dominant visual — no stat strips or secondary promos in the first viewport unless references prove the category demands it *and* the brand asks for it.

Get sign-off if the user is present; otherwise state choices and proceed.

## Phase 5 — Handoff + build

Invoke **`mobbin-web-design@1.0.0`**:

- Implement section by section against the shortlist
- Lock fonts, color, language from `patterns.md`
- Browser verification loop (desktop + mobile) until flawless
