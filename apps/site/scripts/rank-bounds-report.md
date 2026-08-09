# Designesy Leaderboard — Rank-Optimal Weighting Bounds

- Generated: 2026-08-09T12:49:34.842Z
- Base: https://www.designesy.org
- Method: Real check statuses from live /api/score; composite recomputed under 29 weight scenarios (baseline, uniform, per-category ×2 and ×0.5). Rank band = best to worst rank across scenarios.

## Top-5 stability

- Sites that stay in the top 5 under EVERY weight scenario: https://www.designesy.org, https://apple.com, https://primer.style, https://zeroheight.com, https://vercel.com
- Sites in the baseline top 5 that can be pushed out: none

## Per-site rank bands

| Site | Baseline | Rank | Best rank | Worst rank | Band | Score range |
|---|---|---|---|---|---|---|
| https://www.designesy.org | 100 (A) | 1 | 1 | 1 | 0 | 100–100 |
| https://apple.com | 80 (B) | 2 | 2 | 3 | 1 | 76.6–85.8 |
| https://primer.style | 77.6 (C) | 3 | 2 | 4 | 2 | 75–79.3 |
| https://zeroheight.com | 73.8 (C) | 4 | 4 | 6 | 2 | 72.1–78.5 |
| https://vercel.com | 73.6 (C) | 5 | 3 | 6 | 3 | 70.5–75.8 |
| https://x.com | 73.1 (C) | 6 | 4 | 6 | 2 | 69.2–76 |
| https://atlassian.design | 70.2 (C) | 7 | 7 | 9 | 2 | 67.4–74 |
| https://linear.app | 68.6 (D) | 8 | 8 | 14 | 6 | 64.4–70 |
| https://notion.so | 68.5 (D) | 9 | 8 | 12 | 4 | 65.7–74.4 |
| https://figma.com | 68.1 (D) | 10 | 7 | 12 | 5 | 65–75.2 |
| https://designesy.ai.studio | 67.8 (D) | 11 | 7 | 16 | 9 | 64–70.5 |
| https://nytimes.com | 66 (D) | 12 | 10 | 16 | 6 | 62.7–71.5 |
| https://getdesy.com | 66 (D) | 13 | 9 | 15 | 6 | 62.1–69.4 |
| https://github.com | 65.7 (D) | 14 | 10 | 15 | 5 | 63–69.8 |
| https://wikipedia.org | 64.1 (D) | 15 | 12 | 19 | 7 | 60.4–67.1 |
| https://vam.ac.uk | 62.6 (D) | 16 | 14 | 18 | 4 | 59.1–69.4 |
| https://awwwards.com | 62.2 (D) | 17 | 13 | 20 | 7 | 58.6–65.9 |
| https://stripe.com | 61.1 (D) | 18 | 16 | 21 | 5 | 57.9–65.5 |
| https://radix-ui.com | 60.7 (D) | 19 | 15 | 21 | 6 | 56.8–67.8 |
| https://roastbyai.com | 59.3 (F) | 20 | 18 | 21 | 3 | 57.4–63.9 |
| https://m3.material.io | 59 (F) | 21 | 18 | 21 | 3 | 55.6–62.5 |
| https://mozaika.design | 52.6 (F) | 22 | 22 | 24 | 2 | 48.1–56.3 |
| https://stitch.withgoogle.com | 52.5 (F) | 23 | 22 | 24 | 2 | 49.2–55.9 |
| https://plex.ibm.com | 51 (F) | 24 | 24 | 26 | 2 | 46.7–54.8 |
| https://cssdesignawards.com | 51 (F) | 25 | 24 | 26 | 2 | 46.7–54.8 |
| https://carbondesignsystem.com | 50.8 (F) | 26 | 22 | 28 | 6 | 47.4–54.8 |
| https://geist.dev | 50.3 (F) | 27 | 24 | 27 | 3 | 45.5–54 |
| https://spectrum.adobe.com | 49.4 (F) | 28 | 27 | 28 | 1 | 44.8–53 |
| https://pentagram.com | 42.2 (F) | 29 | 29 | 30 | 1 | 38.6–44.5 |
| https://fwa.org | 41.1 (F) | 30 | 29 | 30 | 1 | 37.8–43.5 |

## Reading this

A narrow rank band means the site's position is robust to weight choices; a wide band means the rank is an artifact of the weight table. The OECD Better Life Index analysis (Springer Social Indicators Research) showed 19/36 countries can be ranked #1 by adversarial weights — this report applies the same test to our 30-site leaderboard and publishes the result.
