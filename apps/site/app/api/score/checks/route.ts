import { NextResponse } from 'next/server';
import { CHECKS, CATEGORY_WEIGHTS } from '../../../lib/check-definitions';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

// ── Slop rules (S1-S12) ─────────────────────────────────────────────────────
const SLOP_RULES = [
  { id: 'S1', pattern: 'Overused font family', severity: 5, trigger: 'Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Space Grotesk, Instrument Serif, Geist in font-family', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S2', pattern: 'Full-page gradient background', severity: 5, trigger: 'Multi-color linear-gradient on body/html or fixed/inset:0 overlay (excluding 1px hairlines)', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S3', pattern: 'Purple/violet AI gradient', severity: 4, trigger: 'linear-gradient containing #615fff, #8e51ff, #4f39f6, #7f22fe, #a855f7, #9333ea, #7c3aed, #6d28d9, #5b21b6, or #4c1d95', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S4', pattern: 'Gradient text (background-clip:text)', severity: 4, trigger: 'background-clip: text with 2+ distinct hue families (45° buckets, var() and neutrals ignored)', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S5', pattern: 'Default Tailwind/Bootstrap palette', severity: 5, trigger: '3+ hexes from: #0f172a, #1e293b, #334155, #615fff, #8e51ff, #4f39f6, #7f22fe, #6366f1, #8b5cf6, #a78bfa, #0d6efd, #007bff', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S6', pattern: 'Repeated identical card grid', severity: 5, trigger: '3+ .(card|panel|tile|feature|item|box|cell|block) classes + grid-template-columns: repeat(auto-fit|auto-fill|N)', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S7', pattern: 'Emoji as UI icons', severity: 4, trigger: '2+ emoji (1F300-1FAFF, 2600-27BF, 1F1E6-1F1FF) in button/CTA elements', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S8', pattern: 'AI-pill badge text', severity: 3, trigger: '"AI-powered", "Generate", "Chat with AI", "Powered by AI", "Built with AI", "AI-driven" in HTML', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S9', pattern: 'Lorem ipsum placeholder text', severity: 5, trigger: '"lorem ipsum", "dolor sit amet", "consectetur adipiscing", "sed do eiusmod", "tempor incididunt" in HTML', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S10', pattern: 'Single font family for everything', severity: 4, trigger: 'Exactly 1 unique non-generic font-family (excluding serif/sans-serif/monospace/system-ui)', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S11', pattern: 'Marketing buzzword copy', severity: 3, trigger: '2+ of: streamline, empower, supercharge, world-class, enterprise-grade, next-generation, unlock, leverage, seamless, cutting-edge, revolutionize, game-chang, disrupt, synerg', deduction: 'severity × min(instances, 3), capped at 5' },
  { id: 'S12', pattern: 'Placeholder/stock image URLs', severity: 4, trigger: 'via.placeholder, placehold.co, placeholder.com, dummyimage, picsum.photos, loremflickr, unsplash.com/random|featured', deduction: 'severity × min(instances, 3), capped at 5' },
];

// ── Originality signals (O1-O7) ─────────────────────────────────────────────
const ORIGINALITY_SIGNALS = [
  { id: 'O1', label: 'Bespoke motion easing', maxPoints: 5, formula: '1 (1-2 custom cubic-bezier curves not in preset set) · 3 (3+ curves) · +2 if overshoot (y<0 or y>1) or linear() spring' },
  { id: 'O2', label: 'Modern layout primitives', maxPoints: 2, formula: '1 (1 of clamp()/container queries/subgrid) · 2 (2+)' },
  { id: 'O3', label: 'Typographic detail', maxPoints: 2, formula: '1 (1 advanced type property) · 2 (2+ of font-feature-settings, font-variant-numeric, hanging-punctuation, text-underline-offset, font-optical-sizing)' },
  { id: 'O4', label: 'Tiered reduced-motion', maxPoints: 1, formula: '1 if @media (prefers-reduced-motion) present AND NOT blanket * { animation: none } kill-switch' },
  { id: 'O5', label: 'Motion choreography', maxPoints: 2, formula: '1 (3+ named @keyframes) · 2 (scroll-driven animation or view transitions)' },
  { id: 'O6', label: 'Bespoke iconography', maxPoints: 1, formula: '1 if 3+ inline <svg viewBox> or 2+ <symbol> elements' },
  { id: 'O7', label: 'Semantic design tokens', maxPoints: 6, formula: '2 (4+ semantic tokens) · 4 (8+) · +2 layering (primitive→semantic) · +2 theming (light-dark/data-theme with 4+ tokens) · shadcn fingerprint (≥6 of --background/--foreground/--card/etc.) zeroed' },
];

export function GET() {
  return NextResponse.json({
    contractVersion: 'v0.4.0',
    totalChecks: CHECKS.length,
    scoredChecks: CHECKS.filter((c) => c.type === 'auto').length,
    manualChecks: CHECKS.filter((c) => c.type === 'manual').length,
    categoryWeights: CATEGORY_WEIGHTS,
    totalWeight: Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0),
    checks: CHECKS,
    slopRules: SLOP_RULES,
    slopCaps: { perCheck: 5, total: 20, instanceCap: 3 },
    originalitySignals: ORIGINALITY_SIGNALS,
    originalityCap: 8,
    slopGate: { threshold: 12, effect: 'halves originality lift' },
    a11yFloor: { threshold: 0.6, cap: 70, description: 'accessibility category < 60% caps score at 70' },
  });
}