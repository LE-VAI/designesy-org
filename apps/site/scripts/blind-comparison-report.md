# Blind comparison: Designesy against an independent assessor

- Generated: 2026-09-28T08:50:25.326Z
- Method: Engine (Designesy a11y category >= 60 = PASS) vs axe-core 4.10.2 (zero serious/critical violations = PASS), independent CDP execution
- Left out (no verdict from one rater): https://nytimes.com (the engine could not read it (the engine could not read the page)); https://getdesy.com (the engine could not read it (the engine could not read the page)); https://cssdesignawards.com (the engine could not read it (the engine could not read the page))

## Agreement statistics

- **Cohen's κ = 0.208** (95% CI -0.152 to 0.568): slight agreement
- n = 27 sites, po = 0.593, pe = 0.486
- Base rates: engine 63% PASS against independent 44% PASS; the imbalance depresses κ (the Feinstein–Cicchetti kappa paradox)
- **ppos = 0.621** (proportionate positive agreement) · **pneg = 0.56** (proportionate negative agreement)
- **MCC = 0.223** (Matthews correlation, prevalence-robust) · **Gwet's AC1 = 0.19** (prevalence-robust chance-corrected)
- Both PASS: 9 · Both FAIL: 7 · Engine-only PASS: 8 · Independent-only PASS: 3

## Per-site matrix

| Site | A11y score | Designesy verdict | Independent verdict |
|---|---|---|---|
| https://www.designesy.org | 100 | PASS | FAIL (1 s/c) |
| https://atlassian.design | 62.5 | PASS | PASS (0 s/c) |
| https://x.com | 75 | PASS | FAIL (1 s/c) |
| https://primer.style | 87.5 | PASS | PASS (0 s/c) |
| https://apple.com | 75 | PASS | FAIL (2 s/c) |
| https://vercel.com | 62.5 | PASS | FAIL (1 s/c) |
| https://wikipedia.org | 75 | PASS | PASS (0 s/c) |
| https://figma.com | 62.5 | PASS | PASS (0 s/c) |
| https://designesy.ai.studio | 66.7 | PASS | PASS (0 s/c) |
| https://awwwards.com | 66.7 | PASS | PASS (0 s/c) |
| https://roastbyai.com | 62.5 | PASS | FAIL (2 s/c) |
| https://zeroheight.com | 50 | FAIL | FAIL (3 s/c) |
| https://vam.ac.uk | 50 | FAIL | PASS (0 s/c) |
| https://linear.app | 37.5 | FAIL | FAIL (4 s/c) |
| https://github.com | 62.5 | PASS | PASS (0 s/c) |
| https://m3.material.io | 50 | FAIL | PASS (0 s/c) |
| https://stripe.com | 50 | FAIL | PASS (0 s/c) |
| https://notion.so | 50 | FAIL | FAIL (3 s/c) |
| https://radix-ui.com | 37.5 | FAIL | FAIL (1 s/c) |
| https://mozaika.design | 50 | FAIL | FAIL (2 s/c) |
| https://geist.dev | 62.5 | PASS | PASS (0 s/c) |
| https://stitch.withgoogle.com | 62.5 | PASS | PASS (0 s/c) |
| https://carbondesignsystem.com | 62.5 | PASS | FAIL (2 s/c) |
| https://spectrum.adobe.com | 62.5 | PASS | FAIL (3 s/c) |
| https://plex.ibm.com | 50 | FAIL | FAIL (2 s/c) |
| https://pentagram.com | 62.5 | PASS | FAIL (2 s/c) |
| https://fwa.org | 37.5 | FAIL | FAIL (3 s/c) |

## Reading this

Kappa measures agreement beyond chance between two independent raters. Agreement on PASS sites shows both engines agree a site is accessible; disagreement on FAIL sites shows the contract catches things axe misses (or the reverse). The divergence itself is evidence, and the per-check detail explains which layer owns the difference.
