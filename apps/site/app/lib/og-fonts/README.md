# OG card fonts

Static TTF instances used by `lib/og-card.tsx`. The share-card renderer (Satori,
via `next/og`) cannot read the site's `next/font` WOFF2 files or variable fonts,
so without these every card fell back to a default sans and stopped matching
the site.

| File | Family | Weight | Role |
|---|---|---|---|
| `Fraunces-600.ttf` | Fraunces | 600 | Card title (the site's display face) |
| `Fraunces-700.ttf` | Fraunces | 700 | Score card grade and score (the 144pt optical size) |
| `SchibstedGrotesk-500.ttf` | Schibsted Grotesk | 500 | Lede, endorsement |
| `SchibstedGrotesk-700.ttf` | Schibsted Grotesk | 700 | Summary emphasis |
| `AtkinsonHyperlegibleMono-400.ttf` | Atkinson Hyperlegible Mono | 400 | Labels: eyebrow, path, badge; the live badge's host, date and /100 |

Every file here is licensed under the SIL Open Font License 1.1.
`AtkinsonHyperlegibleMono-OFL.txt` is that face's licence, copied unchanged
from the face's upstream release (version 2.001); the OFL requires it to
travel with the font.

`Fraunces-700.ttf` and `AtkinsonHyperlegibleMono-400.ttf` are static instances
cut from the families' variable fonts (Fraunces wght 700, opsz 144, SOFT 0,
WONK 0; Atkinson Hyperlegible Mono wght 400, names updated) with fontTools
`varLib.instancer`, because Satori reads static fonts only. The mono face
replaced Geist Mono on 2026-10-12.

The logotype on the cards is outlined artwork (`lib/brand-logotype.tsx`), so
no font is loaded for it.
