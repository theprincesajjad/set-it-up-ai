# Playbook: improve an existing web page or screen

1. **Diagnose the job.** One sentence: what should this page make the user do or understand?
2. **Pull references for that job only.**
   - Marketing section → `search_sections`
   - Product screen → `search_screens` `platform: "web"`
   - Journey friction → `search_flows` `platform: "web"`
3. Start `mode: "standard"`; add `mode: "deep"` if you need finer visual/intent match.
4. Compare **your current UI** to 5–8 previews side by side. List concrete deltas: hierarchy, CTA placement, type scale, proof, spacing, state coverage.
5. Change **one system at a time** (hierarchy → type → color → motion), re-checking against refs.
6. Hand remaining implementation polish to **`mobbin-web-design`** and run the browser loop.
