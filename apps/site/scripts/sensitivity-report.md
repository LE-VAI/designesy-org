# Designesy Score Sensitivity Analysis

- Generated: 2026-08-09T12:46:04.430Z
- Base: https://www.designesy.org
- Contract: v0.4.0
- Sites: 30 · Knobs: 35
- Method: real check statuses from the live engine; composite recomputed locally under each perturbation (engine math mirrored exactly).

## Leaderboard-level stability

| Knob | Grade changes | Max Δscore | Mean Δscore | Rank positions moved |
|---|---|---|---|---|
| weights −10% (uniform) | 0 | 0.1 | 0 | 0 |
| weights +10% (uniform) | 0 | 0.1 | 0 | 0 |
| weights −20% (uniform) | 0 | 0 | 0 | 0 |
| weights +20% (uniform) | 0 | 0 | 0 | 0 |
| WARN credit 0.5 → 0.25 | 14 | 15 | 10.36 | 22 |
| WARN credit 0.5 → 0.75 | 22 | 15 | 10.28 | 23 |
| slop deduction +5 | 10 | 15 | 4.35 | 28 |
| originality lift +5 | 6 | 5 | 2.7 | 20 |
| grade bands tightened 2pts (92/82/72/62) | 4 | 0 | 0 | 0 |
| grade bands loosened 2pts (88/78/68/58) | 5 | 0 | 0 | 0 |
| a11y floor 60% → 50% | 0 | 0 | 0 | 0 |
| a11y floor 60% → 70% | 0 | 3.8 | 0.25 | 3 |
| hard-fail ceilings removed | 0 | 0 | 0 | 0 |
| INTERACTION: WARN 0.75 × slop +5 | 26 | 26.6 | 12.98 | 27 |
| INTERACTION: WARN 0.25 × slop +5 | 12 | 19.6 | 9.07 | 28 |
| INTERACTION: WARN 0.75 × a11y floor 70% | 22 | 15 | 9.98 | 25 |
| INTERACTION: WARN 0.25 × a11y floor 70% | 14 | 15 | 10.36 | 22 |
| INTERACTION: slop +5 × originality +5 | 11 | 16 | 4.91 | 27 |
| INTERACTION: WARN 0.75 × originality +5 | 19 | 19.6 | 9.78 | 27 |
| INTERACTION: WARN 0.75 × ceilings removed | 22 | 15 | 10.28 | 23 |
| INTERACTION: slop +5 × ceilings removed | 10 | 15 | 4.35 | 28 |
| OAT: cadence weight ×1.5 | 3 | 2.1 | 0.64 | 11 |
| OAT: accessibility weight ×1.5 | 4 | 2.2 | 0.57 | 15 |
| OAT: semantic weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: motion weight ×1.5 | 3 | 1.8 | 0.91 | 19 |
| OAT: tokens weight ×1.5 | 3 | 2.5 | 1.24 | 16 |
| OAT: takt weight ×1.5 | 0 | 1.3 | 0.59 | 15 |
| OAT: poise weight ×1.5 | 0 | 1.1 | 0.46 | 12 |
| OAT: identity weight ×1.5 | 1 | 1.3 | 0.61 | 9 |
| OAT: interaction weight ×1.5 | 1 | 1.9 | 1.21 | 16 |
| OAT: performance weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: responsive weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: security weight ×1.5 | 2 | 1.3 | 0.9 | 4 |
| OAT: spec weight ×1.5 | 1 | 0.6 | 0.11 | 4 |
| OAT: copywriting weight ×1.5 | 3 | 2 | 1 | 13 |

## Most sensitive knobs

- **INTERACTION: WARN 0.75 × slop +5**: 26 grade changes, max Δ26.6 pts, 27 rank positions moved
- **WARN credit 0.5 → 0.75**: 22 grade changes, max Δ15 pts, 23 rank positions moved
- **INTERACTION: WARN 0.75 × a11y floor 70%**: 22 grade changes, max Δ15 pts, 25 rank positions moved
- **INTERACTION: WARN 0.75 × ceilings removed**: 22 grade changes, max Δ15 pts, 23 rank positions moved
- **INTERACTION: WARN 0.75 × originality +5**: 19 grade changes, max Δ19.6 pts, 27 rank positions moved
- **WARN credit 0.5 → 0.25**: 14 grade changes, max Δ15 pts, 22 rank positions moved
- **INTERACTION: WARN 0.25 × a11y floor 70%**: 14 grade changes, max Δ15 pts, 22 rank positions moved
- **INTERACTION: WARN 0.25 × slop +5**: 12 grade changes, max Δ19.6 pts, 28 rank positions moved

## Per-site detail

| Site | Base | Grade | Score range across knobs | Grade range |
|---|---|---|---|---|
| https://www.designesy.org | 100 | A | 98.9–100 | A–A |
| https://apple.com | 80 | B | 67–88 | B–D |
| https://primer.style | 77.6 | C | 74.2–84 | B–C |
| https://zeroheight.com | 73.8 | C | 62.4–83.1 | B–D |
| https://vercel.com | 73.6 | C | 67.7–79.4 | C–D |
| https://x.com | 73.1 | C | 61.7–84.4 | B–D |
| https://atlassian.design | 70.2 | C | 58.7–81.6 | B–F |
| https://linear.app | 68.6 | D | 61.2–81 | B–D |
| https://notion.so | 68.5 | D | 59.4–77.6 | C–F |
| https://figma.com | 68.1 | D | 60.599999999999994–80.6 | B–D |
| https://designesy.ai.studio | 67.8 | D | 53.4–82.3 | B–F |
| https://nytimes.com | 66 | D | 53.5–78.5 | C–F |
| https://getdesy.com | 66 | D | 55.599999999999994–86.4 | B–F |
| https://wikipedia.org | 64.1 | D | 54–74.3 | C–F |
| https://vam.ac.uk | 62.6 | D | 52–74.2 | C–F |
| https://awwwards.com | 62.2 | D | 49.2–75.3 | C–F |
| https://stripe.com | 61.099999999999994 | D | 53.099999999999994–84.1 | B–F |
| https://radix-ui.com | 60.7 | D | 52.1–75 | C–F |
| https://roastbyai.com | 59.3 | F | 49.1–79.5 | C–F |
| https://m3.material.io | 59 | F | 39.8–75.1 | C–F |
| https://github.com | 65.7 | D | 62.2–84.3 | B–D |
| https://mozaika.design | 52.6 | F | 33–72.2 | C–F |
| https://stitch.withgoogle.com | 52.5 | F | 37.5–71.5 | C–F |
| https://plex.ibm.com | 51 | F | 31.5–70.6 | C–F |
| https://carbondesignsystem.com | 50.8 | F | 41.4–74.1 | C–F |
| https://geist.dev | 50.3 | F | 36–68.7 | D–F |
| https://spectrum.adobe.com | 49.4 | F | 36–65.8 | D–F |
| https://fwa.org | 41.1 | F | 27.1–63 | D–F |
| https://pentagram.com | 42.2 | F | 30.5–68.8 | D–F |
| https://cssdesignawards.com | 51 | F | 32.2–69.8 | D–F |
