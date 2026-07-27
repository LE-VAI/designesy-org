import { NextResponse } from 'next/server';
import { scoreUrl, normalizeInputUrl, isValidUrl } from '../../api/score/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Embeddable score badge — the viral distribution surface.
//
//   <img src="https://www.designesy.org/score/badge?url=designesy.org" alt="Designesy score" />
//
// Returns a compact SVG badge (shields.io pattern) carrying a real design-contract
// grade. Reuses the cached scoreUrl so the badge is instant for already-scored
// sites. Edge-cached for 1h (shorter than the OG image's 1y because a site's score
// can drift as it evolves; badges should stay reasonably current).
//
// Three render paths:
//   - valid url + scored → grade letter + score% in grade color
//   - valid url + score error → grey "unreachable" badge
//   - missing/invalid url → grey "enter a URL" badge

const W = 220;
const H = 44;

// Grade → color. Mirrors opengraph-image.tsx GRADE_COLOR (A/B signal, C/D amber, F red).
const GRADE_FILL: Record<string, string> = {
  A: '#3358e8',
  B: '#3358e8',
  C: '#c9a227',
  D: '#c9a227',
  F: '#c4503e',
};

type BadgeState =
  | { kind: 'scored'; grade: string; score: number; url: string }
  | { kind: 'unreachable'; url: string }
  | { kind: 'invalid'; rawUrl: string };

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function renderBadge(state: BadgeState): string {
  const label = 'designesy';
  let gradeText: string;
  let gradeFill: string;
  let valueText: string;

  if (state.kind === 'scored') {
    gradeText = state.grade;
    gradeFill = GRADE_FILL[state.grade] || '#6b6b6b';
    valueText = `${state.score}%`;
  } else if (state.kind === 'unreachable') {
    gradeText = '—';
    gradeFill = '#6b6b6b';
    valueText = 'unreachable';
  } else {
    gradeText = '—';
    gradeFill = '#6b6b6b';
    valueText = 'enter a URL';
  }

  const displayUrl =
    state.kind === 'scored'
      ? state.url
      : state.kind === 'unreachable'
        ? state.url
        : state.rawUrl;
  const host = displayUrl
    ? truncate(displayUrl.replace(/^https?:\/\//, '').replace(/^www\./, ''), 28)
    : 'designesy.org';

  // Badge layout: [label | grade | host · score%]
  // Three segments. The grade segment is colored by GRADE_FILL.
  const segLabel = 70;
  const segGrade = 36;
  const segValue = W - segLabel - segGrade;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Designesy score: Grade ${escapeXml(gradeText)} ${escapeXml(valueText)} for ${escapeXml(host)}">
  <title>Designesy score — ${escapeXml(host)}</title>
  <linearGradient id="bg" x2="0" y2="1">
    <stop offset="0" stop-color="#101010"/>
    <stop offset="1" stop-color="#0a0a0a"/>
  </linearGradient>
  <rect width="${W}" height="${H}" rx="6" fill="url(#bg)" stroke="rgba(255,255,255,0.12)"/>
  <!-- label segment -->
  <rect x="0" y="0" width="${segLabel}" height="${H}" rx="6" fill="rgba(255,255,255,0.04)"/>
  <text x="${segLabel / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#a0a0a0" letter-spacing="0.04em">${escapeXml(label)}</text>
  <!-- grade segment -->
  <rect x="${segLabel}" y="0" width="${segGrade}" height="${H}" fill="${gradeFill}"/>
  <text x="${segLabel + segGrade / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${escapeXml(gradeText)}</text>
  <!-- value segment: host · score% -->
  <text x="${segLabel + segGrade + 10}" y="${H / 2 - 6}" dominant-baseline="central" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="500" fill="#a0a0a0">${escapeXml(host)}</text>
  <text x="${segLabel + segGrade + 10}" y="${H / 2 + 7}" dominant-baseline="central" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#ffffff" font-variant-numeric="tabular-nums">${escapeXml(valueText)}</text>
</svg>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url') || '';

  // Missing or invalid URL → grey "enter a URL" badge (still a valid SVG so
  // embedders get a graceful fallback, not a broken image).
  if (!rawUrl) {
    const svg = renderBadge({ kind: 'invalid', rawUrl: '' });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const url = normalizeInputUrl(rawUrl);
  if (!url || !isValidUrl(url)) {
    const svg = renderBadge({ kind: 'invalid', rawUrl });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const result = await scoreUrl(url);
    const svg = renderBadge({
      kind: 'scored',
      grade: result.grade,
      score: result.score,
      url,
    });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        // 1h edge cache — badges should stay reasonably current; a site's
        // score can drift as it evolves. The underlying scoreUrl is cached
        // separately for 24h via unstable_cache, so even on edge-miss the
        // badge regenerates instantly.
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    const svg = renderBadge({ kind: 'unreachable', url });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}