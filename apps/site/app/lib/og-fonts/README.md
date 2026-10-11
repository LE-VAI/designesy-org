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
| `GeistMono-400.ttf` | Geist Mono | 400 | Labels: eyebrow, path, badge |

Every file here is licensed under the SIL Open Font License 1.1.

`Fraunces-700.ttf` and `GeistMono-400.ttf` are static instances cut from the
families' variable fonts (Fraunces wght 700, opsz 144, SOFT 0, WONK 0; Geist
Mono wght 400) with fontTools `varLib.instancer`, because Satori reads static
fonts only.

The logotype on the cards is outlined artwork (`lib/brand-logotype.tsx`), so
no font is loaded for it.
