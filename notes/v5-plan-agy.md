# Token Radar v5 — Design Plan

## 1. What I studied

### DeFiLlama (the data source)
Studied the UI by description and real screenshots. Concrete lessons taken:

| Lesson | What they do | What we apply |
|--------|-------------|---------------|
| Font | `system-ui` stack with no external load | Already using `--sans: -apple-system, BlinkMacSystemFont…`. Keep. Add `system-ui` as first entry. |
| Numbers | Same sans face with `font-variant-numeric: tabular-nums`. NOT a separate monospace face in tables. | Remove monospace from formula-short in-line; tabular-nums already set on `.num`. |
| Accent | No amber. No purple. No blue gradient. Changes are green/red only. Everything else is a shade of gray. | Strip amber from implied column, sort arrows, focus rings, links, selected row. Replace with neutral white/gray. |
| Hierarchy | One key stat per row (the TVL or implied value) is simply the rightmost column, not coloured amber — the position and bold weight create emphasis, not colour. | Implied value: bold white (#fafafa), not amber. |
| Category | Plain text, same size as body, muted. NOT a badge, NOT a chip. | Already plain text. Keep. |
| Row separation | A faint 1px divider. No alternating row backgrounds (too heavy). | Already in place with `var(--line-soft)`. |
| Header | Compact. Title + one-liner description. No decorative subheads. | Tighten h1 to 20–22px, reduce top padding. |
| Stats line | In DeFiLlama the top bar is literally plain text: "Protocols: 3,897 · $104.9B TVL". One line, no boxes, no labels with strong weight. | Make our factsline a single inline text string rather than a dl with big values. |

### L2Beat
Studied by description and design system references. Concrete lessons taken:

| Lesson | What they do | What we apply |
|--------|-------------|---------------|
| Text colour | Primary: `#fafafa` near-white. Secondary: `#ccd0da` slate. | Align our `--text` to `#f4f4f5` (slightly warmer than pure white) and `--muted` to `#a1a1aa` (zinc-400). |
| Accent usage | One accent, used sparingly — only for truly interactive states (the focused element). Never for data. | Focus rings: use a neutral blue `#60a5fa` (blue-400) instead of amber. This is the standard browser-visible focus colour; it passes WCAG. |
| Row contrast | Hover row: a very subtle 3% white overlay. Selected row: 6% white overlay, NOT a coloured left-border. | Change selected row to a white overlay (`rgba(255,255,255,0.06)`). Remove amber left-border. |
| Typography | 14px body, 12px table headers. | Already in place. Keep. |
| Spacing | Tight but breathable: 8–10px cell padding, 20–28px section padding. | Already in place. |

---

## 2. What is wrong in v4 (judged against those references)

### Complaint 1: "Pemilihan masih AI slop" (design choices still AI slop)
- **Amber implied value column** — amber is a decorative accent. DeFiLlama doesn't colour its key column; it uses bold weight and position. The amber reads as "look at me, I'm a design decision" rather than "this is a data table".
- **Amber sort arrows** — standard DeFiLlama sort arrows are a neutral muted color. Amber arrows look like a React tutorial template.
- **Amber focus rings** — focus rings should be a standard accessibility colour (blue or white), not the brand accent. Using the accent for focus is an AI-generated pattern.
- **Amber link hover** — link hover should be underline or slight lightening, not a colour change to amber.
- **Amber selected row left-border** — decorative stripe is a UI-kit pattern, not a data-table pattern.
- **favicon is an amber circle** — no. Remove or neutralise.

### Complaint 2: "Layout ai slop, berantakan" (layout is messy)
- **Stats as `<dl>` with big bold values** — the label+value pair with a large bold number looks like a "stats card". DeFiLlama does it as one plain line of text. Make it truly inline.
- **Model bar**: The `<details>` summary has a monospace formula inline. This is fine but the label-formula layout creates visual clutter. The `+/-` toggle should be obvious.
- **Controls row**: Filters have labels attached, which is correct, but the row looks crowded. The `count` is pushed to the right with `margin-left: auto` — that is fine but the spacing between label and input feels inconsistent.
- **Detail panel left column**: After the 8 fact rows, the proof text is a full paragraph under a lot of empty space. The `d-grid` split is `5fr 7fr` which makes the left column narrow.

### Complaint 3: "Readability juga kureng" (readability is poor)
- `--faint: #9ba0a8` on `--bg: #101014` = contrast ratio ~4.0:1. WCAG AA needs 4.5:1. Must darken or lighten.
- `--muted: #c3c7ce` on `--bg: #101014` = ~8.5:1 — fine.
- The `.factsline dt` is `--faint` at 12px. That's the worst combo: small text, low contrast.
- Table `thead th` uses `--muted` at 12px bold. That's acceptable but the column labels could be clearer.
- The implied value in amber creates a **readability distraction** — the eye goes there first, not to the protocol name. With neutral white, the eye scans the name first (left), then the implied value (right), which is the natural reading direction.

---

## 3. Specific changes (v5 vs v4)

### CSS changes (app.css)
1. **Remove `--amber` from all data/interactive states.** The variable stays defined (for the skip link, which is an accessibility affordance not a design choice — but even that can be blue).
2. **New focus colour: `--focus: #60a5fa`** (blue-400) — neutral, standard, passes WCAG AA on dark bg.
3. **Implied value: bold white** — `color: var(--text); font-weight: 700`. No amber.
4. **Sort arrows: muted gray `↑↓`, active direction: white `↑` or `↓`** — same face, different weight.
5. **Selected row: subtle white overlay** — `background: rgba(255,255,255,0.06)`. No left border stripe.
6. **Hover row: `rgba(255,255,255,0.03)`** — same as DeFiLlama.
7. **Name link hover: underline only, no color change** — or slight brightness increase.
8. **`--faint` → `#b0b4bd`** — higher contrast (≥4.5:1 on `#101014`).
9. **`factsline` dt contrast**: use `--muted` not `--faint` for 12px stat labels.
10. **Skip link: blue background** (or keep amber — this is accessibility not design. Keep amber but it's hidden until focused).
11. **favicon: neutral grey circle** instead of amber.
12. **`theme-color` meta: neutral** `#101014` already. Fine.
13. **d-grid ratio**: change to `4fr 6fr` for a less squished left column.
14. **Detail close button hover**: white border/text instead of amber.
15. **Focus outlines across all interactive elements**: `var(--focus)` blue.
16. **Input/select focus**: `var(--focus)` blue border, not amber.
17. **Header**: reduce h1 to 22px. Reduce `.top` padding to 16px 28px 12px.
18. **factsline**: render as one plain line with separators instead of a dl grid. Keep the dl structure for semantics but style it as one line.

### HTML changes (index.html)
1. **favicon SVG**: change amber fill to `#6b7280` (gray).
2. **theme-color**: already neutral.
3. No structural changes needed.

### JS changes (app.js, presentation only)
1. **Sort arrow indicator text**: change `↕` (21C5) to `⇅` or just plain `-` for unsorted.
2. The `asc/desc` class still drives the CSS arrow, so no JS logic changes.
3. The `renderDetail` amber hover on d-close is CSS only.

### What stays the same
- All model logic (impliedOf, farmStepsFor, etc.)
- All 178 data rows
- All farm plan text
- All accessibility structure (sort buttons, skip link, detail close, focus return)
- All keyboard navigation
- All hash routing

---

## 4. Implementation checklist

- [ ] Write notes/v5-plan-agy.md (this file)
- [ ] Edit app.css: remove amber from data/interactive, add focus blue, fix contrast
- [ ] Edit app.js: update sort arrow symbols if needed (cosmetic only)
- [ ] Edit index.html: fix favicon, potentially tighten header markup
- [ ] Run main.ts twice, verify byte-identical outputs
- [ ] Run __radarCheck in browser
- [ ] Re-render screenshots with Playwright
- [ ] Run Lighthouse desktop + mobile
- [ ] Commit with correct identity
- [ ] Push to origin master
- [ ] Report back

---

## 5. Colour tokens (v5)

```
--bg:      #101014   (unchanged)
--panel:   #16161b   (unchanged)
--panel2:  #1b1b21   (unchanged)
--line:    #26262e   (unchanged)
--line-soft: #202028 (unchanged)
--text:    #f4f4f5   (slightly warmer, was #f2f2ee — negligible)
--muted:   #a1a1aa   (zinc-400 — slightly lower than v4's #c3c7ce to stay muted)
--faint:   #71717a   (zinc-500 — but we won't use on 12px; only on 14px+ elements)
--focus:   #60a5fa   (blue-400 — replaces amber for all interactive states)
--green:   #4ade80   (unchanged)
--red:     #f87171   (unchanged)
```

Wait — let me recalculate contrast:
- `#a1a1aa` on `#101014`: luminance of #a1a1aa ≈ 0.374, of #101014 ≈ 0.003. Ratio = (0.374+0.05)/(0.003+0.05) ≈ 8.0:1. Fine.
- `#71717a` on `#101014`: luminance ≈ 0.196. Ratio = (0.196+0.05)/(0.003+0.05) ≈ 4.6:1. Passes AA.
- `#60a5fa` on `#101014`: passes AA for focus rings (not text, so 3:1 needed for UI components).

Actually, keep `--muted: #c3c7ce` (the original) since it was fine. The only real fix is `--faint`:
- `#9ba0a8` on `#101014`: ratio ≈ (0.337+0.05)/(0.003+0.05) ≈ 7.3:1. That's actually fine.

Let me recheck: `#9ba0a8` relative luminance = 0.2126*(155/255)^2.2 + 0.7152*(160/255)^2.2 + 0.0722*(168/255)^2.2 ≈ 0.2126*0.337 + 0.7152*0.367 + 0.0722*0.413 ≈ 0.0716+0.262+0.0298 ≈ 0.363. On #101014 ≈ 0.003. Ratio = (0.363+0.05)/(0.003+0.05) ≈ 7.8:1. Passes.

So the `--faint` colour itself is fine. The issue is **using it on 12px text** (the factsline labels). At 12px, even 7.8:1 can feel hard to read in practice. The fix is to use `--muted` (lighter) for those labels, or bump font-size to 13px.

---

## 2. Finishing notes (parent, after the Antigravity run ended on quota)

- The `agy` run (Claude Sonnet 4.6) died at the Lighthouse comparison step with a 429: third-party quota reached, resets in ~4h34m. The redesign above was already complete and verified before it died.
- Fixes applied by the parent after the run ended:
  - `--faint: #71717a` (3.93:1) failed WCAG AA, so it became `#80808a` (4.86:1). This fixed the `.factsline` contrast failure.
  - `thead th` used `var(--faint)` on a `var(--panel2)` background, which still failed contrast, so it became `var(--muted)` (#a1a1aa). This fixed the sort-button contrast failure and brought accessibility back to 100.
- Fair back-to-back Lighthouse comparison (same script, same machine): v5 Desktop 93/100/100/100, Mobile 99/100/100/100; v4 Desktop 89/100/100/100, Mobile 99/100/100/100. The agent's "desktop 70" reading was measurement noise, not a regression. v5 is equal or better on every category.
- Verification after the fixes: main.ts run twice, byte-identical; `__radarCheck` 178 rows, 0 mismatches, no console errors; dashboard source 45,779 bytes (under 64 KB).
