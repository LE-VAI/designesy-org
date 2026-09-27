# OG card fonts

Static TTF instances used by `lib/og-card.tsx`. The share-card renderer (Satori,
via `next/og`) cannot read the site's `next/font` WOFF2 files or variable fonts,
so without these every card fell back to a default sans and stopped matching
the site.

| File | Family | Weight | Role |
|---|---|---|---|
| `Fraunces-600.ttf` | Fraunces | 600 | Card title (the site's display face) |
| `SchibstedGrotesk-500.ttf` | Schibsted Grotesk | 500 | Lede, path |
| `SchibstedGrotesk-700.ttf` | Schibsted Grotesk | 700 | Eyebrow, wordmark |

All three are from Google Fonts and licensed under the SIL Open Font License 1.1.
