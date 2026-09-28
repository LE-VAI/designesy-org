# Designesy Score Sensitivity Analysis

- Generated: 2026-09-28T20:20:14.400Z
- Base: https://www.designesy.org
- Contract: v0.4.1
- Sites: 27 · Knobs: 35
- Excluded, the engine could not read them: https://nytimes.com, https://getdesy.com, https://cssdesignawards.com
- Method: real check statuses from the live engine; composite recomputed locally under each perturbation (engine math mirrored exactly).

## Leaderboard-level stability

| Knob | Grade changes | Max Δscore | Mean Δscore | Rank positions moved |
|---|---|---|---|---|
| weights −10% (uniform) | 0 | 0.1 | 0 | 0 |
| weights +10% (uniform) | 0 | 0 | 0 | 0 |
| weights −20% (uniform) | 0 | 0.1 | 0 | 0 |
| weights +20% (uniform) | 0 | 0 | 0 | 0 |
| WARN credit 0.5 → 0.25 | 18 | 16.1 | 9.51 | 21 |
| WARN credit 0.5 → 0.75 | 22 | 15.9 | 9.24 | 22 |
| slop deduction +5 | 12 | 15 | 4.87 | 25 |
| originality lift +5 | 6 | 5 | 2.56 | 16 |
| grade bands tightened 2pts (92/82/72/62) | 8 | 0 | 0 | 0 |
| grade bands loosened 2pts (88/78/68/58) | 4 | 0 | 0 | 0 |
| a11y floor 60% → 50% | 0 | 9.3 | 0.4 | 6 |
| a11y floor 60% → 70% | 2 | 16.1 | 1.51 | 5 |
| hard-fail ceilings removed | 0 | 0 | 0 | 0 |
| INTERACTION: WARN 0.75 × slop +5 | 23 | 26.1 | 12.15 | 24 |
| INTERACTION: WARN 0.25 × slop +5 | 15 | 19.8 | 8.55 | 25 |
| INTERACTION: WARN 0.75 × a11y floor 70% | 21 | 14.8 | 8.09 | 23 |
| INTERACTION: WARN 0.25 × a11y floor 70% | 19 | 17.9 | 10.06 | 19 |
| INTERACTION: slop +5 × originality +5 | 15 | 16 | 5.09 | 20 |
| INTERACTION: WARN 0.75 × originality +5 | 18 | 19.8 | 9.06 | 25 |
| INTERACTION: WARN 0.75 × ceilings removed | 22 | 15.9 | 9.24 | 22 |
| INTERACTION: slop +5 × ceilings removed | 12 | 15 | 4.87 | 25 |
| OAT: cadence weight ×1.5 | 1 | 2.1 | 0.62 | 4 |
| OAT: accessibility weight ×1.5 | 1 | 2.5 | 0.81 | 9 |
| OAT: semantic weight ×1.5 | 1 | 1.7 | 0.6 | 7 |
| OAT: motion weight ×1.5 | 3 | 1.9 | 0.97 | 19 |
| OAT: tokens weight ×1.5 | 1 | 1.8 | 0.67 | 2 |
| OAT: takt weight ×1.5 | 2 | 1.2 | 0.43 | 11 |
| OAT: poise weight ×1.5 | 2 | 1.1 | 0.61 | 9 |
| OAT: identity weight ×1.5 | 2 | 0.9 | 0.39 | 0 |
| OAT: interaction weight ×1.5 | 4 | 2.5 | 1.14 | 14 |
| OAT: performance weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: responsive weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: security weight ×1.5 | 2 | 1.3 | 0.65 | 2 |
| OAT: spec weight ×1.5 | 0 | 1.4 | 0.18 | 4 |
| OAT: copywriting weight ×1.5 | 2 | 2 | 0.72 | 7 |

## Most sensitive knobs

- **INTERACTION: WARN 0.75 × slop +5**: 23 grade changes, max Δ26.1 pts, 24 rank positions moved
- **WARN credit 0.5 → 0.75**: 22 grade changes, max Δ15.9 pts, 22 rank positions moved
- **INTERACTION: WARN 0.75 × ceilings removed**: 22 grade changes, max Δ15.9 pts, 22 rank positions moved
- **INTERACTION: WARN 0.75 × a11y floor 70%**: 21 grade changes, max Δ14.8 pts, 23 rank positions moved
- **INTERACTION: WARN 0.25 × a11y floor 70%**: 19 grade changes, max Δ17.9 pts, 19 rank positions moved
- **INTERACTION: WARN 0.75 × originality +5**: 18 grade changes, max Δ19.8 pts, 25 rank positions moved
- **WARN credit 0.5 → 0.25**: 18 grade changes, max Δ16.1 pts, 21 rank positions moved
- **INTERACTION: WARN 0.25 × slop +5**: 15 grade changes, max Δ19.8 pts, 25 rank positions moved

## Per-site detail

| Site | Base | Grade | Score range across knobs | Grade range |
|---|---|---|---|---|
| https://www.designesy.org | 93 | A | 90–100 | A–A |
| https://wikipedia.org | 87.9 | B | 70–94.6 | A–C |
| https://atlassian.design | 86.1 | B | 70–93.7 | A–C |
| https://primer.style | 82.4 | B | 77–90.8 | A–C |
| https://apple.com | 82.1 | B | 67.6–91.7 | A–D |
| https://vercel.com | 81.7 | B | 70–91.2 | A–C |
| https://x.com | 81.5 | B | 70–92.3 | A–C |
| https://figma.com | 76.6 | C | 69–89.2 | B–D |
| https://designesy.ai.studio | 74.8 | C | 63.6–85.9 | B–D |
| https://roastbyai.com | 71.2 | C | 63.400000000000006–89 | B–D |
| https://awwwards.com | 70.3 | C | 59.7–81 | B–F |
| https://zeroheight.com | 70 | C | 70–90.9 | A–D |
| https://vam.ac.uk | 70 | C | 63.3–81 | B–D |
| https://linear.app | 69.5 | D | 61–70 | C–D |
| https://github.com | 68.5 | D | 63–89.1 | B–D |
| https://m3.material.io | 67.6 | D | 49.9–82.3 | B–F |
| https://stripe.com | 66.9 | D | 58.2–90.7 | A–F |
| https://notion.so | 65 | D | 57.400000000000006–82.6 | B–F |
| https://radix-ui.com | 63.2 | D | 53–70 | C–F |
| https://mozaika.design | 62.8 | D | 43–82.6 | B–F |
| https://geist.dev | 62 | D | 48–80 | B–F |
| https://stitch.withgoogle.com | 61.2 | D | 47.6–78.8 | C–F |
| https://carbondesignsystem.com | 60.7 | D | 55–75 | C–F |
| https://spectrum.adobe.com | 58.9 | F | 45.8–75 | C–F |
| https://plex.ibm.com | 58.3 | F | 38.5–78.1 | C–F |
| https://pentagram.com | 55.2 | F | 44.1–81.3 | B–F |
| https://fwa.org | 48 | F | 34.4–69.6 | D–F |
