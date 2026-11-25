# Token Radar v7 — Plan (draft 25 Nov 2026, 08:55 WIB)

## Why v7, and why now
- Best entry remains v2: dev rate 0.863170 (12-0-0), submitted 23 Nov 19:19 WIB.
- v6 scored 0.778045 (9-2-1), rank 11,895/18,211. v5/v6 neutral DeFiLlama-style
  design scored BELOW the amber v2. Direction for v7: go back to v2 as the base,
  keep only the v6 fixes that are proven (see below). Do not repeat the v5/v6
  neutral redesign.
- Daily quota reset 07:00 WIB today (25 Nov): 5 submissions/day fresh, 5 of 10
  total submissions used, 5 remain. Entries close 14 Dec 2026 17:00 WIB.
- Caution: each rate comes from only 12 games, so 0.863 vs 0.778 is a signal,
  not proof. v7 must be judged on its own rate after submit, and previewed to
  Rey before submitting (rule set after the v3 rejection).

## v7 = v2 base + these v6 fixes only
1. Favicon: plain .ico file (v6 fix). Never inline SVG with an http(s) string
   in any attribute; that exact string gate-failed v3 and v5.
2. Readability: faint/muted contrast at least 4.5:1 on small text (v5 plan
   section 3, item 8: --faint to #b0b4bd or equivalent on the v2 palette).
3. Lighthouse: keep desktop + mobile 94/100/100/100 or better (v6 level).
4. Keep from v2, do NOT strip: amber implied-value column, amber sort/focus
   accents, the in-page recompute of the value model and farm-plan generation
   (the judge reads only the 3 screenshots + dossier text from dashboard/
   files; model logic must stay visible in-page, per v2-plan diagnosis).
5. Keep 178 rows, model constants, farm-plan text. No model change in v7;
   this iteration tests presentation only, so the rate difference is readable.

## Before submit (checklist)
- `makefun` bundle + all 15 checks pass; screenshots 1-board / 2-detail /
  3-filtered reviewed against v2 screenshots, not just Lighthouse.
- Preview shown to Rey first. Submit only after his go-ahead for this version.
- One submission only (6th of 10). If v7 rate < v2, v2 stays the best entry;
  nothing is lost except one submission slot.

## Not today
- tiny-stack-vm-01-run-20261122: do NOT chase. Deadline 11:00 WIB 25 Nov,
  prize $10 each for places 1-10 only, 16,312 submissions, hundreds already
  at the perfect 1,000,000 score. Expected value near zero in the ~2h left.
- news-image-20261124: entry Ideal Helix already in; round 3 judged 19:00 WIB
  today, final round 07:00 WIB tomorrow 26 Nov. No new entry needed.
