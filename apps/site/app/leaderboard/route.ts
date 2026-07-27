// /leaderboard — public leaderboard API
// Serves the curated seed list (30 sites across 5 tiers) as JSON.
// v1: static seed list, scores null until batch-scored.
// v2 will add persistence + open submission + weekly re-scoring.
export const dynamic = 'force-static';

const SEED = [
  // Tier 1 — Reference-tier craft
  { rank: null, url: 'https://linear.app', name: 'Linear', tier: 1, category: 'SaaS', score: null, grade: null, seededBecause: 'Frontier reference — invariant-craft tier' },
  { rank: null, url: 'https://vercel.com', name: 'Vercel', tier: 1, category: 'SaaS', score: null, grade: null, seededBecause: 'Frontier reference — Geist design system' },
  { rank: null, url: 'https://stripe.com', name: 'Stripe', tier: 1, category: 'SaaS', score: null, grade: null, seededBecause: 'Frontier reference — mature design system' },
  { rank: null, url: 'https://apple.com', name: 'Apple', tier: 1, category: 'Hardware', score: null, grade: null, seededBecause: 'Apple HIG — tiered reduced-motion reference' },
  { rank: null, url: 'https://nytimes.com', name: 'The New York Times', tier: 1, category: 'Editorial', score: null, grade: null, seededBecause: 'Editorial typography — Cadence rules origin' },
  // Tier 2 — Competitors
  { rank: null, url: 'https://mozaika.design', name: 'Mozaika', tier: 2, category: 'Design Systems', score: null, grade: null, seededBecause: 'Closest competitor — 0-100 score comparison' },
  { rank: null, url: 'https://www.designesy.org', name: 'Designesy', tier: 2, category: 'Design Systems', score: null, grade: null, seededBecause: 'Self-score — transparency earns trust' },
  { rank: null, url: 'https://designesy.ai.studio', name: 'Designesy AI Studio', tier: 2, category: 'Design Systems', score: null, grade: null, seededBecause: 'AI Studio mirror — parity relationship' },
  { rank: null, url: 'https://getdesy.com', name: 'Desy Guard', tier: 2, category: 'Design Systems', score: null, grade: null, seededBecause: 'AST-gate competitor' },
  { rank: null, url: 'https://stitch.withgoogle.com', name: 'Google Stitch', tier: 2, category: 'Design Systems', score: null, grade: null, seededBecause: 'DESIGN.md ecosystem' },
  { rank: null, url: 'https://zeroheight.com', name: 'zeroheight', tier: 2, category: 'Design Systems', score: null, grade: null, seededBecause: 'DTCG 2025.10 incumbent' },
  { rank: null, url: 'https://roastbyai.com', name: 'Roast by AI', tier: 2, category: 'Design Systems', score: null, grade: null, seededBecause: 'Roast competitor — leaderboard model reference' },
  // Tier 3 — Design-system exemplars
  { rank: null, url: 'https://atlassian.design', name: 'Atlassian Design System', tier: 3, category: 'Design Systems', score: null, grade: null, seededBecause: 'Motion + tokens exemplar' },
  { rank: null, url: 'https://primer.style', name: 'GitHub Primer', tier: 3, category: 'Design Systems', score: null, grade: null, seededBecause: 'Contract-adjacent' },
  { rank: null, url: 'https://carbondesignsystem.com', name: 'IBM Carbon', tier: 3, category: 'Design Systems', score: null, grade: null, seededBecause: 'Mature token system' },
  { rank: null, url: 'https://spectrum.adobe.com', name: 'Adobe Spectrum', tier: 3, category: 'Design Systems', score: null, grade: null, seededBecause: 'Motion $type reference' },
  { rank: null, url: 'https://m3.material.io', name: 'Material 3', tier: 3, category: 'Design Systems', score: null, grade: null, seededBecause: 'MotionScheme + Sound — closest to designesy combo' },
  { rank: null, url: 'https://radix-ui.com', name: 'Radix Colors', tier: 3, category: 'Design Systems', score: null, grade: null, seededBecause: '12-step semantic color' },
  { rank: null, url: 'https://geist-ui.com', name: 'Vercel Geist', tier: 3, category: 'Design Systems', score: null, grade: null, seededBecause: '.md-for-agents pattern' },
  { rank: null, url: 'https://plex.ibm.com', name: 'IBM Plex', tier: 3, category: 'Typography', score: null, grade: null, seededBecause: 'Org-first type system' },
  // Tier 4 — Inspiration / exemplar sites
  { rank: null, url: 'https://awwwards.com', name: 'Awwwards', tier: 4, category: 'Inspiration', score: null, grade: null, seededBecause: 'Exemplar discovery surface' },
  { rank: null, url: 'https://fwa.org', name: 'FWA', tier: 4, category: 'Inspiration', score: null, grade: null, seededBecause: 'Creative exemplars' },
  { rank: null, url: 'https://cssdesignawards.com', name: 'CSS Design Awards', tier: 4, category: 'Inspiration', score: null, grade: null, seededBecause: 'Design awards' },
  { rank: null, url: 'https://pentagram.com', name: 'Pentagram', tier: 4, category: 'Agency', score: null, grade: null, seededBecause: 'Parent-system posture analog' },
  { rank: null, url: 'https://vam.ac.uk', name: 'V&A Museum', tier: 4, category: 'Cultural', score: null, grade: null, seededBecause: 'Pentagram brand identity case study' },
  // Tier 5 — High-traffic public sites
  { rank: null, url: 'https://github.com', name: 'GitHub', tier: 5, category: 'SaaS', score: null, grade: null, seededBecause: 'High-traffic dev surface — Primer in production' },
  { rank: null, url: 'https://notion.so', name: 'Notion', tier: 5, category: 'SaaS', score: null, grade: null, seededBecause: 'Product surface — Linear/Stripe competitor' },
  { rank: null, url: 'https://figma.com', name: 'Figma', tier: 5, category: 'SaaS', score: null, grade: null, seededBecause: 'Design tool surface — token workflow origin' },
  { rank: null, url: 'https://x.com', name: 'X', tier: 5, category: 'Consumer', score: null, grade: null, seededBecause: 'High-traffic consumer surface — a11y calibration' },
  { rank: null, url: 'https://wikipedia.org', name: 'Wikipedia', tier: 5, category: 'Reference', score: null, grade: null, seededBecause: 'High-traffic reference — minimal-design baseline' },
];

export function GET() {
  return Response.json(
    {
      ok: true,
      version: '0.1.0',
      total: SEED.length,
      scoredCount: SEED.filter((s) => s.score !== null).length,
      policy:
        'Curated seed (30 sites) + open submission. Scores are deterministic — 34 checks, no LLM. Sites scoring below 50 are flagged "needs work", not hidden. No paywall, no pay-to-remove.',
      sites: SEED,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}