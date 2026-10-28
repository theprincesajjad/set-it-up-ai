# Typography & language from Mobbin web refs

## Type extraction worksheet

For each hero / key screen in the shortlist, answer:

1. **Display classification** — geometric / humanist / grotesque / serif / mono / mixed?
2. **Weight drama** — black vs bold vs medium for H1?
3. **Tracking** — tight on large display? loose on small caps labels?
4. **Case** — sentence / Title / ALL CAPS labels?
5. **Color roles** — ink, muted, accent on how many words?
6. **Split headlines** — two-tone lines (primary + muted continuation)?

Then lock:

```css
:root {
  --font-display: "…", sans-serif;
  --font-text: "…", sans-serif;
  --font-mono: "…", ui-monospace, monospace;
  --fs-hero: clamp(2.5rem, 5vw, 4.5rem);
  --fs-section: clamp(1.75rem, 3vw, 2.5rem);
  --fs-body: 1.0625rem;
  --lh-display: 1.05;
  --lh-body: 1.6;
}
```

## Pairing heuristics (start here, then verify against refs)

| Mood from refs | Display direction | Text direction |
|---|---|---|
| Clinical SaaS | Neo-grotesque, medium–bold | Same family, regular |
| Editorial / magazine | Serif display or high-contrast sans | Quiet sans or soft serif |
| Brutalist / portfolio | Grotesque or mono, aggressive sizes | Mono or plain grotesque |
| Consumer fintech | Geometric bold | Humanist text |
| Developer tool | Slightly technical sans + mono accents | Same + mono for code |

Never pick Inter/Roboto “because Next defaulted to it.” If refs are neutral
SaaS and the brand wants invisibility, a grotesque is fine — **say so** in
`patterns.md`.

## Language formulas

### Headlines

| Formula | Example shape | Use when |
|---|---|---|
| Outcome | “Manage X like a …” | Category leaders sell results |
| Specificity | “See where Y is really coming from” | Analytics / insight products |
| Speed | “Get up and running in seconds” | Low-friction PLG tools |
| Provocation | Question or contrarian claim | Crowded categories |

One formula per page. Do not mix outcome + provocation in the same hero.

### CTA system

| Role | Verb traits | Examples |
|---|---|---|
| Primary | Action + low fear | Start for free, Get started, Sign up |
| Secondary | Human / sales | Book demo, Contact sales, Talk to us |
| Tertiary | Orient | Log in, Docs, Pricing |

Lock **one** primary verb. Repeat it in nav, hero, and end CTA.

### Microcopy near money

Steal structure from Mobbin checkout/pricing refs:

- Trial clarity (“8 days left”)
- Charge clarity (“Total charged today: $0”)
- Trust (“Payment processed securely”)
- Inclusion (“Campaigns — INCLUDED”)

Rewrite with **your** real numbers. Never fake.

## Voice checklist

- [ ] No lorem / “Welcome to …”
- [ ] Support line ≠ headline paraphrase
- [ ] Same intent → same label everywhere
- [ ] Errors are specific and inline
- [ ] Empty states tell how to fill themselves
