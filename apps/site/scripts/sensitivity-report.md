# Designesy Score Sensitivity Analysis

- Generated: 2026-08-09T03:18:27.284Z
- Base: https://www.designesy.org
- Contract: v0.4.0
- Sites: 30 · Knobs: 27
- Method: real check statuses from the live engine; composite recomputed locally under each perturbation (engine math mirrored exactly).

## Leaderboard-level stability

| Knob | Grade changes | Max Δscore | Mean Δscore | Rank positions moved |
|---|---|---|---|---|
| weights −10% (uniform) | 0 | 0.1 | 0 | 0 |
| weights +10% (uniform) | 0 | 0.1 | 0 | 0 |
| weights −20% (uniform) | 0 | 0 | 0 | 0 |
| weights +20% (uniform) | 0 | 0 | 0 | 0 |
| WARN credit 0.5 → 0.25 | 14 | 15 | 10.39 | 22 |
| WARN credit 0.5 → 0.75 | 21 | 15 | 10.31 | 23 |
| slop deduction +5 | 10 | 15 | 4.32 | 26 |
| originality lift +5 | 6 | 5 | 2.7 | 20 |
| grade bands tightened 2pts (92/82/72/62) | 4 | 0 | 0 | 0 |
| grade bands loosened 2pts (88/78/68/58) | 5 | 0 | 0 | 0 |
| a11y floor 60% → 50% | 0 | 0 | 0 | 0 |
| a11y floor 60% → 70% | 0 | 3.8 | 0.25 | 3 |
| hard-fail ceilings removed | 0 | 0 | 0 | 0 |
| OAT: cadence weight ×1.5 | 3 | 2.1 | 0.65 | 9 |
| OAT: accessibility weight ×1.5 | 4 | 2.2 | 0.59 | 15 |
| OAT: semantic weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: motion weight ×1.5 | 3 | 1.8 | 0.91 | 19 |
| OAT: tokens weight ×1.5 | 3 | 2.5 | 1.23 | 15 |
| OAT: takt weight ×1.5 | 0 | 1.3 | 0.59 | 14 |
| OAT: poise weight ×1.5 | 0 | 1.1 | 0.46 | 11 |
| OAT: identity weight ×1.5 | 1 | 1.6 | 0.67 | 8 |
| OAT: interaction weight ×1.5 | 1 | 1.9 | 1.21 | 15 |
| OAT: performance weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: responsive weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: security weight ×1.5 | 2 | 1.3 | 0.9 | 4 |
| OAT: spec weight ×1.5 | 1 | 0.6 | 0.11 | 4 |
| OAT: copywriting weight ×1.5 | 3 | 2 | 0.95 | 13 |

## Most sensitive knobs

- **WARN credit 0.5 → 0.75**: 21 grade changes, max Δ15 pts, 23 rank positions moved
- **WARN credit 0.5 → 0.25**: 14 grade changes, max Δ15 pts, 22 rank positions moved
- **slop deduction +5**: 10 grade changes, max Δ15 pts, 26 rank positions moved
- **originality lift +5**: 6 grade changes, max Δ5 pts, 20 rank positions moved
- **grade bands loosened 2pts (88/78/68/58)**: 5 grade changes, max Δ0 pts, 0 rank positions moved
- **OAT: accessibility weight ×1.5**: 4 grade changes, max Δ2.2 pts, 15 rank positions moved
- **grade bands tightened 2pts (92/82/72/62)**: 4 grade changes, max Δ0 pts, 0 rank positions moved
- **OAT: tokens weight ×1.5**: 3 grade changes, max Δ2.5 pts, 15 rank positions moved

## Per-site detail

| Site | Base | Grade | Score range across knobs | Grade range |
|---|---|---|---|---|
| https://www.designesy.org | 100 | A | 100–100 | A–A |
| https://apple.com | 80 | B | 70–88 | B–C |
| https://primer.style | 77.6 | C | 74.2–81 | B–C |
| https://zeroheight.com | 73.8 | C | 64.4–83.1 | B–D |
| https://vercel.com | 73.6 | C | 67.7–79.4 | C–D |
| https://x.com | 73.1 | C | 61.7–84.4 | B–D |
| https://atlassian.design | 70.2 | C | 58.7–81.6 | B–F |
| https://linear.app | 68.6 | D | 61.2–76 | C–D |
| https://notion.so | 68.5 | D | 59.4–77.6 | C–F |
| https://figma.com | 68.1 | D | 60.599999999999994–75.6 | C–D |
| https://designesy.ai.studio | 67.8 | D | 53.4–82.3 | B–F |
| https://nytimes.com | 66 | D | 53.5–78.5 | C–F |
| https://getdesy.com | 66 | D | 55.599999999999994–76.4 | C–F |
| https://wikipedia.org | 64.1 | D | 54–74.3 | C–F |
| https://vam.ac.uk | 62.6 | D | 52–73.2 | C–F |
| https://awwwards.com | 62.2 | D | 49.2–75.3 | C–F |
| https://stripe.com | 61.099999999999994 | D | 53.099999999999994–70 | C–F |
| https://radix-ui.com | 60.7 | D | 52.1–70 | C–F |
| https://roastbyai.com | 59.3 | F | 49.1–69.5 | D–F |
| https://m3.material.io | 59 | F | 44.8–73.1 | C–F |
| https://github.com | 65.7 | D | 62.2–80.7 | B–D |
| https://mozaika.design | 52.6 | F | 38–67.2 | D–F |
| https://stitch.withgoogle.com | 52.5 | F | 37.5–67.5 | D–F |
| https://plex.ibm.com | 51 | F | 36.5–65.6 | D–F |
| https://carbondesignsystem.com | 50.8 | F | 41.4–64.8 | D–F |
| https://geist.dev | 50.3 | F | 37–63.7 | D–F |
| https://spectrum.adobe.com | 49.4 | F | 36–62.8 | D–F |
| https://fwa.org | 41.1 | F | 27.1–55 | F–F |
| https://pentagram.com | 42.2 | F | 30.5–57.2 | F–F |
| https://cssdesignawards.com | 37.9 | F | 23.299999999999997–52.5 | F–F |
