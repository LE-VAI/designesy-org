import { ImageResponse } from 'next/og';
import { scoreUrl, normalizeInputUrl, isValidUrl } from '../api/score/route';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Score — design legitimacy grade';

// Contract tokens — keep in sync with app/lib/og-card.tsx
const T = {
  paper: '#000000',
  ink: '#ffffff',
  muted: '#a0a0a0',
  mutedDim: '#6b6b6b',
  surface: '#0a0a0a',
  surfaceRaised: '#101010',
  line: 'rgba(255, 255, 255, 0.12)',
  lineStrong: 'rgba(255, 255, 255, 0.22)',
  signal: '#0133cb',
  signalLight: '#3358e8',
  signalDim: 'rgba(1, 51, 203, 0.14)',
} as const;

// Grade → color mapping. A/B get signal blue (legit); C/D get muted amber;
// F gets a restrained red. All contract-restrained — no neon.
const GRADE_COLOR: Record<string, string> = {
  A: T.signalLight,
  B: T.signalLight,
  C: '#c9a227',
  D: '#c9a227',
  F: '#c4503e',
};

type ScoreResult = {
  score: number;
  grade: string;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  total: number;
};

export default async function ScoreOpenGraphImage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const rawUrl = typeof params?.url === 'string' ? params.url : '';

  // Default card when no URL — mirrors the site default OG but score-themed
  if (!rawUrl) {
    return renderCard({
      eyebrow: 'Score',
      title: 'Score any site',
      lede: '26 checks against a real design contract. One grade.',
      siteUrl: '',
      score: null,
    });
  }

  const url = normalizeInputUrl(rawUrl);
  if (!url || !isValidUrl(url)) {
    return renderCard({
      eyebrow: 'Score',
      title: 'Invalid URL',
      lede: 'Enter a valid domain like designesy.org or nike.com.',
      siteUrl: rawUrl,
      score: null,
    });
  }

  try {
    const result = await scoreUrl(url);
    return renderCard({
      eyebrow: 'Designesy Score',
      title: `Grade ${result.grade} — ${result.score}%`,
      lede: `${result.pass} passed · ${result.fail} failed · ${result.warn} warnings · ${result.skip} skipped`,
      siteUrl: url,
      score: result,
    });
  } catch {
    return renderCard({
      eyebrow: 'Designesy Score',
      title: 'Score pending',
      lede: `Could not reach ${url}. Try again at designesy.org/score.`,
      siteUrl: url,
      score: null,
    });
  }
}

function renderCard({
  eyebrow,
  title,
  lede,
  siteUrl,
  score,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  siteUrl: string;
  score: ScoreResult | null;
}) {
  const grade = score?.grade;
  const gradeColor = grade ? GRADE_COLOR[grade] || T.muted : T.muted;

  // Truncate long URLs for the footer
  const displayUrl = siteUrl
    ? siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 48)
    : 'designesy.org/score';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: T.paper,
          color: T.ink,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          padding: '64px 72px',
          position: 'relative',
        }}
      >
        {/* Quiet frame */}
        <div
          style={{
            position: 'absolute',
            inset: 28,
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            display: 'flex',
          }}
        />

        {/* Top row: eyebrow + grade badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${T.signalDim}`,
                borderRadius: 999,
                background: T.surface,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: T.signal,
                }}
              />
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: T.mutedDim,
                display: 'flex',
              }}
            >
              {eyebrow}
            </div>
          </div>
          {grade ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: `1px solid ${gradeColor}44`,
                background: `${gradeColor}1a`,
                borderRadius: 8,
                padding: '10px 18px',
              }}
            >
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: gradeColor,
                  display: 'flex',
                  lineHeight: 1,
                }}
              >
                {grade}
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: T.muted,
                  display: 'flex',
                  letterSpacing: '0.04em',
                }}
              >
                GRADE
              </span>
            </div>
          ) : null}
        </div>

        {/* Center claim */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            maxWidth: 920,
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: title.length > 28 ? 64 : 76,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
              color: T.ink,
              display: 'flex',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.35,
              color: T.muted,
              display: 'flex',
              maxWidth: 860,
            }}
          >
            {lede}
          </div>
        </div>

        {/* Footer: wordmark + scored URL */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            width: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              color: T.ink,
              display: 'flex',
            }}
          >
            designesy
            <span style={{ color: T.signal }}>.</span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              color: T.mutedDim,
              letterSpacing: '0.01em',
              display: 'flex',
            }}
          >
            {displayUrl}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}