# Blind Comparison — Designesy vs Independent Assessor

- Generated: 2026-08-09T12:48:45.882Z
- Method: Engine (Designesy a11y category >= 60 = PASS) vs axe-core 4.10.2 (zero serious/critical violations = PASS), independent CDP execution

## Agreement statistics

- **Cohen's κ = 0.043** (95% CI -0.3 to 0.385) — slight agreement
- n = 30 sites, po = 0.5, pe = 0.478
- Base rates: engine 67% PASS vs independent 43% PASS — the imbalance depresses κ (Feinstein–Cicchetti kappa paradox)
- **ppos = 0.545** (proportionate positive agreement) · **pneg = 0.444** (proportionate negative agreement)
- **MCC = 0.048** (Matthews correlation, prevalence-robust) · **Gwet's AC1 = 0.01** (prevalence-robust chance-corrected)
- Both PASS: 9 · Both FAIL: 6 · Engine-only PASS: 11 · Independent-only PASS: 4

## Per-site matrix

| Site | A11y score | Designesy verdict | Independent verdict |
|---|---|---|---|
| https://www.designesy.org | 100 | PASS | PASS (0 s/c) |
| https://apple.com | 70 | PASS | FAIL (2 s/c) |
| https://primer.style | 80 | PASS | PASS (0 s/c) |
| https://zeroheight.com | 60 | PASS | FAIL (4 s/c) |
| https://vercel.com | 60 | PASS | FAIL (6 s/c) |
| https://x.com | 70 | PASS | FAIL (7 s/c) |
| https://atlassian.design | 60 | PASS | PASS (0 s/c) |
| https://linear.app | 40 | FAIL | FAIL (4 s/c) |
| https://notion.so | 60 | PASS | FAIL (2 s/c) |
| https://figma.com | 60 | PASS | PASS (0 s/c) |
| https://designesy.ai.studio | 66.7 | PASS | PASS (0 s/c) |
| https://nytimes.com | 60 | PASS | FAIL (3 s/c) |
| https://getdesy.com | 75 | PASS | FAIL (1 s/c) |
| https://wikipedia.org | 70 | PASS | PASS (0 s/c) |
| https://vam.ac.uk | 50 | FAIL | PASS (0 s/c) |
| https://awwwards.com | 58.3 | FAIL | FAIL (1 s/c) |
| https://stripe.com | 50 | FAIL | PASS (0 s/c) |
| https://radix-ui.com | 40 | FAIL | PASS (0 s/c) |
| https://roastbyai.com | 60 | PASS | FAIL (3 s/c) |
| https://m3.material.io | 50 | FAIL | PASS (0 s/c) |
| https://github.com | 60 | PASS | PASS (0 s/c) |
| https://mozaika.design | 50 | FAIL | FAIL (1 s/c) |
| https://stitch.withgoogle.com | 60 | PASS | PASS (0 s/c) |
| https://plex.ibm.com | 50 | FAIL | FAIL (1 s/c) |
| https://carbondesignsystem.com | 60 | PASS | FAIL (2 s/c) |
| https://geist.dev | 60 | PASS | PASS (0 s/c) |
| https://spectrum.adobe.com | 60 | PASS | FAIL (1 s/c) |
| https://fwa.org | 40 | FAIL | FAIL (3 s/c) |
| https://pentagram.com | 60 | PASS | FAIL (1 s/c) |
| https://cssdesignawards.com | 50 | FAIL | FAIL (3 s/c) |

## Reading this

Kappa measures agreement beyond chance between two independent raters. Agreement on PASS sites shows both engines agree a site is accessible; disagreement on FAIL sites shows the contract catches things axe misses (or vice versa) — the divergence itself is evidence, and the per-check detail explains which layer owns the difference.
