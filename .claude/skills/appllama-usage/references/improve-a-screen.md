# Playbook: make an existing screen better (Mobbin MCP)

The user has a screen (code, screenshot, or a live app) and wants it better.
"Better" means: measurably closer to the best equivalent screens shipped by
real production apps on Mobbin — in hierarchy, motion, and feel — verified in the
simulator, not eyeballed in code.

## 1. Diagnose before you search

Run the screen in the simulator and study it against appllama-app-design-skill's
definition-of-done checklist. Name the top 3 deficits precisely ("no visual
hierarchy — three same-weight text rows", "dead motion — modal pops with no
transition", "non-native segmented control"). The research pass is aimed at
these deficits, not at vague "inspiration".

## 2. The Standard + Deep reference board

Run both Mobbin search modes (and pass `exclude_screen_ids` if you want additional pages beyond the first 20–30):

- `search_screens(query="<screen type and concrete UI elements>", platform="ios", mode="standard", limit=20)` (0 credits) —
  finds production screens matching your screen type and components (e.g.
  `"workout summary screen with pace stats and route map"`, `"habit streak calendar with weekly completion bars"`).
- `search_screens(query="<nuanced intent, layout hierarchy, and visual feel>", platform="ios", mode="deep", limit=20)` (5 credits) —
  uses Mobbin's AI pipeline to score candidates for nuanced intent and visual structure (e.g.
  `"dark mode stats dashboard with a single hero metric and compact weekly bar chart"`).
  Different screens will surface — that's the point of running both `"standard"` and `"deep"`.
- If building a web desk or responsive web surface, also run `search_screens(..., platform="web")` and `search_sections` (0 credits).

Save the strongest candidates into your local `research/` board (and optionally a Mobbin collection via `save_content` + `add_comment`). Pick the **best 5–8** and say why each earns its place. Re-query or fetch with `image_quality: "high"` on your top picks (or query `"<App Name> <screen type>"`) to inspect fine typography, spacing, and sister screens from the same app.

## 3. Extract the pattern

From the picks, write the target: layout skeleton, hierarchy order, control
choices, spacing rhythm, palette role-mapping, motion moments (entrance,
press feedback, data reveal). This is a spec, not a mood board — every line
should be checkable in a screenshot.

## 4. Rebuild and iterate (the loop)

1. Implement against the spec using **appllama-app-design-skill** (typography
   ramp, semantic colors both themes, native controls, Reanimated motion
   with the platform's curves, state kept boring).
2. Asset gaps (illustration, empty-state art, icons beyond the symbol set):
   generate with the best available image model at max quality, one style
   system, per the design skill's image-assets reference.
3. **Simulator loop until perfect**: screenshot → compare side-by-side with
   your top Mobbin references → fix → repeat. Record the motion and scrub it
   frame by frame. Verify Dynamic Island/safe areas, dark + light, Dynamic
   Type XL, Reduce Motion, 60fps on the interaction.
4. Do not stop at "better than before". Stop when the honest side-by-side
   with the best reference reads **at least as good** — hierarchy, motion,
   font discipline, state handling, everything. If it doesn't, name the gap
   and go around again.

## 5. If the screen is part of a flow

Screens live in journeys. After the screen passes, walk one step before and
one step after it in the simulator: entrance transition, exit transition,
state carried across — and what back does from it on iOS and Android
(appllama-app-design-skill's Navigation laws).
If the screen is a sheet, a modal, or a step behind a one-way door, verify
its presentation matches what it *is*, not just how it looks. Use `search_flows` and `search_screens(query="<App Name> <flow>", platform="ios", mode="standard")` if
you need to see how winning apps chain the surrounding steps
([references/research-methods.md](research-methods.md)).
