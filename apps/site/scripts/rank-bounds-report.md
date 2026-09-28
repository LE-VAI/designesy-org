# Designesy Leaderboard — Rank-Optimal Weighting Bounds

- Generated: 2026-09-28T07:09:52.402Z
- Base: https://www.designesy.org
- Excluded, the engine could not read them: https://nytimes.com, https://getdesy.com, https://cssdesignawards.com
- Method: Real check statuses from live /api/score; composite recomputed under 29 weight scenarios (baseline, uniform, per-category ×2 and ×0.5). Rank band = best to worst rank across scenarios.

## Top-5 stability

- Sites that stay in the top 5 under EVERY weight scenario: https://www.designesy.org, https://atlassian.design, https://x.com, https://apple.com, https://primer.style
- Sites in the baseline top 5 that can be pushed out: none

## Per-site rank bands

| Site | Baseline | Rank | Best rank | Worst rank | Band | Score range |
|---|---|---|---|---|---|---|
| https://www.designesy.org | 93 (A) | 1 | 1 | 1 | 0 | 93–93 |
| https://atlassian.design | 86.1 (B) | 2 | 2 | 4 | 2 | 83.3–87.8 |
| https://x.com | 84.2 (B) | 3 | 2 | 6 | 4 | 80.4–88.7 |
| https://apple.com | 83.1 (B) | 4 | 3 | 6 | 3 | 79.5–88.5 |
| https://primer.style | 82.4 (B) | 5 | 3 | 7 | 4 | 79.2–84.3 |
| https://vercel.com | 81.7 (B) | 6 | 4 | 7 | 3 | 78.5–83.6 |
| https://wikipedia.org | 80.7 (B) | 7 | 3 | 8 | 5 | 76.5–83 |
| https://figma.com | 76.6 (C) | 8 | 7 | 9 | 2 | 73.8–81.4 |
| https://designesy.ai.studio | 74.8 (C) | 9 | 8 | 10 | 2 | 70.7–77.1 |
| https://awwwards.com | 71.6 (C) | 10 | 10 | 16 | 6 | 67.8–74.1 |
| https://roastbyai.com | 71.2 (C) | 11 | 9 | 15 | 6 | 68.9–74.3 |
| https://zeroheight.com | 70 (C) | 12 | 10 | 13 | 3 | 70–70 |
| https://vam.ac.uk | 70 (C) | 13 | 12 | 14 | 2 | 68.5–70 |
| https://linear.app | 69.5 (D) | 14 | 13 | 16 | 3 | 64.7–70 |
| https://github.com | 68.5 (D) | 15 | 11 | 16 | 5 | 65.4–73.1 |
| https://m3.material.io | 67.6 (D) | 16 | 13 | 19 | 6 | 63.7–70 |
| https://stripe.com | 66.9 (D) | 17 | 15 | 19 | 4 | 63.3–70 |
| https://notion.so | 65 (D) | 18 | 17 | 21 | 4 | 62.2–70 |
| https://radix-ui.com | 63.2 (D) | 19 | 18 | 24 | 6 | 59.1–70 |
| https://mozaika.design | 62.8 (D) | 20 | 17 | 21 | 4 | 58.4–66.2 |
| https://geist.dev | 62 (D) | 21 | 19 | 22 | 3 | 57.1–65.3 |
| https://stitch.withgoogle.com | 61.2 (D) | 22 | 20 | 25 | 5 | 56.6–64.4 |
| https://carbondesignsystem.com | 60.7 (D) | 23 | 20 | 25 | 5 | 58.3–64.9 |
| https://spectrum.adobe.com | 58.9 (F) | 24 | 22 | 26 | 4 | 54.5–62.3 |
| https://plex.ibm.com | 58.3 (F) | 25 | 23 | 26 | 3 | 54.2–62.1 |
| https://pentagram.com | 55.2 (F) | 26 | 23 | 26 | 3 | 52.9–61.1 |
| https://fwa.org | 48 (F) | 27 | 27 | 27 | 0 | 44.4–51.4 |

## Reading this

A narrow rank band means the site's position is robust to weight choices; a wide band means the rank is an artifact of the weight table. The OECD Better Life Index analysis (Springer Social Indicators Research) showed 19/36 countries can be ranked #1 by adversarial weights — this report applies the same test to our 30-site leaderboard and publishes the result.
