# Designesy Score Sensitivity Analysis

- Generated: 2026-10-12T22:05:53.672Z
- Base: https://www.designesy.org
- Contract: v0.4.5
- Sites: 27 · Knobs: 36
- Excluded, the engine could not read them: https://nytimes.com, https://getdesy.com, https://cssdesignawards.com
- Method: real check statuses from the live engine; composite recomputed locally under each perturbation (engine math mirrored exactly).

## Leaderboard-level stability

| Knob | Grade changes | Max Δscore | Mean Δscore | Rank positions moved |
|---|---|---|---|---|
| weights −10% (uniform) | 0 | 0 | 0 | 0 |
| weights +10% (uniform) | 0 | 0 | 0 | 0 |
| weights −20% (uniform) | 0 | 0 | 0 | 0 |
| weights +20% (uniform) | 0 | 0 | 0 | 0 |
| WARN credit 0.5 → 0.25 | 16 | 14.4 | 8.02 | 21 |
| WARN credit 0.5 → 0.75 | 15 | 19.9 | 8.83 | 24 |
| slop deduction +5 | 4 | 15 | 2.78 | 24 |
| originality lift +5 | 9 | 5 | 2.48 | 19 |
| grade bands tightened 2pts (92/82/72/62) | 7 | 0 | 0 | 0 |
| grade bands loosened 2pts (88/78/68/58) | 3 | 0 | 0 | 0 |
| a11y floor 60% → 50% | 1 | 14.9 | 0.86 | 13 |
| a11y floor 60% → 70% | 3 | 14.4 | 1.46 | 7 |
| hard-fail ceilings removed | 2 | 5 | 0.2 | 7 |
| any-FAIL cap removed (the rule before engine 1.3.0) | 1 | 0.5 | 0.02 | 2 |
| INTERACTION: WARN 0.75 × slop +5 | 15 | 25.1 | 9.23 | 24 |
| INTERACTION: WARN 0.25 × slop +5 | 16 | 19.1 | 8.61 | 25 |
| INTERACTION: WARN 0.75 × a11y floor 70% | 13 | 14.1 | 6.37 | 25 |
| INTERACTION: WARN 0.25 × a11y floor 70% | 18 | 19.9 | 9.41 | 21 |
| INTERACTION: slop +5 × originality +5 | 6 | 16 | 3.02 | 20 |
| INTERACTION: WARN 0.75 × originality +5 | 14 | 19.1 | 8.91 | 23 |
| INTERACTION: WARN 0.75 × ceilings removed | 20 | 21.6 | 9.84 | 23 |
| INTERACTION: slop +5 × ceilings removed | 5 | 15 | 2.96 | 24 |
| OAT: cadence weight ×1.5 | 0 | 2.6 | 0.46 | 10 |
| OAT: accessibility weight ×1.5 | 2 | 1.9 | 0.64 | 12 |
| OAT: semantic weight ×1.5 | 2 | 2.1 | 0.57 | 11 |
| OAT: motion weight ×1.5 | 2 | 1.9 | 0.88 | 11 |
| OAT: tokens weight ×1.5 | 0 | 1.7 | 0.49 | 2 |
| OAT: takt weight ×1.5 | 0 | 1.3 | 0.24 | 7 |
| OAT: poise weight ×1.5 | 0 | 0.9 | 0.41 | 8 |
| OAT: identity weight ×1.5 | 0 | 0.9 | 0.3 | 2 |
| OAT: interaction weight ×1.5 | 0 | 2.6 | 0.99 | 14 |
| OAT: performance weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: responsive weight ×1.5 | 0 | 0 | 0 | 0 |
| OAT: security weight ×1.5 | 0 | 1.3 | 0.49 | 5 |
| OAT: spec weight ×1.5 | 0 | 1.4 | 0.12 | 2 |
| OAT: copywriting weight ×1.5 | 1 | 2 | 0.56 | 10 |

## Most sensitive knobs

- **INTERACTION: WARN 0.75 × ceilings removed**: 20 grade changes, max Δ21.6 pts, 23 rank positions moved
- **INTERACTION: WARN 0.25 × a11y floor 70%**: 18 grade changes, max Δ19.9 pts, 21 rank positions moved
- **INTERACTION: WARN 0.25 × slop +5**: 16 grade changes, max Δ19.1 pts, 25 rank positions moved
- **WARN credit 0.5 → 0.25**: 16 grade changes, max Δ14.4 pts, 21 rank positions moved
- **INTERACTION: WARN 0.75 × slop +5**: 15 grade changes, max Δ25.1 pts, 24 rank positions moved
- **WARN credit 0.5 → 0.75**: 15 grade changes, max Δ19.9 pts, 24 rank positions moved
- **INTERACTION: WARN 0.75 × originality +5**: 14 grade changes, max Δ19.1 pts, 23 rank positions moved
- **INTERACTION: WARN 0.75 × a11y floor 70%**: 13 grade changes, max Δ14.1 pts, 25 rank positions moved

## Per-site detail

| Site | Base | Grade | Score range across knobs | Grade range |
|---|---|---|---|---|
| https://www.designesy.org | 100 | A | 97.4–100 | A–A |
| https://atlassian.design | 89.9 | B | 70–95.6 | A–C |
| https://primer.style | 89.9 | B | 80–95.8 | A–B |
| https://x.com | 87.8 | B | 70–95.4 | A–C |
| https://figma.com | 84.4 | B | 70–90.6 | A–C |
| https://wikipedia.org | 83.8 | B | 78.6–88.9 | B–C |
| https://apple.com | 83.1 | B | 69.5–91.7 | A–D |
| https://carbondesignsystem.com | 82.8 | B | 70–89.9 | B–C |
| https://roastbyai.com | 81.7 | B | 70–89.9 | B–C |
| https://vercel.com | 81.1 | B | 70–87.9 | B–C |
| https://designesy.ai.studio | 74.5 | C | 63.3–85.8 | B–D |
| https://awwwards.com | 72.1 | C | 62.2–82 | B–D |
| https://linear.app | 70 | C | 70–91.6 | A–D |
| https://stripe.com | 70 | C | 63.2–89.9 | B–D |
| https://zeroheight.com | 70 | C | 70–91.4 | A–D |
| https://radix-ui.com | 70 | C | 61.4–79.8 | C–D |
| https://vam.ac.uk | 70 | C | 65.2–85.6 | B–D |
| https://stitch.withgoogle.com | 68.5 | D | 51.1–85 | B–F |
| https://m3.material.io | 66.4 | D | 49.3–80.4 | B–F |
| https://notion.so | 65.5 | D | 57.900000000000006–83 | B–F |
| https://spectrum.adobe.com | 65.1 | D | 46.7–83.6 | B–F |
| https://github.com | 65 | D | 65–70 | C–D |
| https://geist.dev | 64.4 | D | 51.7–81.2 | B–F |
| https://mozaika.design | 64.3 | D | 45.3–83.4 | B–F |
| https://plex.ibm.com | 56.8 | F | 37.7–75.8 | C–F |
| https://pentagram.com | 56.599999999999994 | F | 46.5–81.7 | B–F |
| https://fwa.org | 54.6 | F | 43.4–70 | C–F |
