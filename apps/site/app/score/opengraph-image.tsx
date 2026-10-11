import { ImageResponse } from 'next/og';
import { scoreUrl, normalizeInputUrl, isValidUrl } from '../api/score/route';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { OG_ENDORSEMENT, OG_T as T, OgLockup, ogFonts, renderOgCard } from '../lib/og-card';
import { fmtScore, scopeLabel } from './verdict';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy contract score and grade';

// Grade inks on the dark surfaces (identity v1, D5 and D18): a data palette
// that never borrows the brand's colours. Order is the band's, F to A.
const BANDS = [
  { grade: 'F', color: '#EF4444', span: 2 },
  { grade: 'D', color: '#FB7185', span: 1 },
  { grade: 'C', color: '#EAB308', span: 1 },
  { grade: 'B', color: '#84CC16', span: 1 },
  { grade: 'A', color: '#22C55E', span: 1 },
] as const;

// Mirrors the engine's ScoreResult, but score/grade are nullable: an
// unreachable target produces no grade, and this card must be able to say so
// rather than being forced to invent one.
type ScoreResult = {
  score: number | null;
  grade: string | null;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  total: number;
  scope?: string;
};

// A card with no grade on it (no URL, an invalid one, an unreachable target)
// is the standard share card with the score icon.
function plainCard(title: string, lede: string, eyebrow = 'Score') {
  return renderOgCard({ eyebrow, title, lede, path: 'designesy.org/score', icon: 'score' });
}

export default async function ScoreOpenGraphImage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const rawUrl = typeof params?.url === 'string' ? params.url : '';

  if (!rawUrl) {
    return plainCard('Score any site', `${ENGINE_CHECK_COUNT} checks against a real design contract. One grade.`);
  }

  const url = normalizeInputUrl(rawUrl);
  if (!url || !isValidUrl(url)) {
    return plainCard('Invalid URL', 'Enter a valid domain like designesy.org or nike.com.');
  }

  try {
    const result = await scoreUrl(url);
    if (result.score === null || !result.grade) {
      return plainCard('Not scored', 'The target could not be read, so no score is reported.', 'Designesy Score');
    }
    return renderScoreCard(url, result);
  } catch {
    return plainCard('Score pending', `Could not reach ${url}. Try again at designesy.org/score.`, 'Designesy Score');
  }
}

/** The summary line: what failed, then what needs work. */
function summary({ pass, fail, warn }: ScoreResult): { lead: string; rest: string } {
  if (fail > 0) {
    return {
      lead: `${fail} failed ${fail === 1 ? 'check' : 'checks'}`,
      rest: warn > 0 ? `, and ${warn} that need work.` : `, and ${pass} passed.`,
    };
  }
  if (warn > 0) return { lead: 'No failed checks', rest: `, and ${warn} that need work.` };
  return { lead: 'Every check passed', rest: '.' };
}

/**
 * The score share card (identity v1, the brand-world og-score composition):
 * the lockup, the site and its reading, the grade and score in Fraunces, the
 * grade band with this grade lit, and one summary line.
 */
function renderScoreCard(siteUrl: string, score: ScoreResult) {
  const grade = score.grade ?? '';
  const band = BANDS.find((b) => b.grade === grade);
  const gradeColor = band ? band.color : T.muted;
  const displayUrl = siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').slice(0, 40);
  const reading = scopeLabel(score.scope);
  const { lead, rest } = summary(score);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: T.paper,
          color: T.ink,
          fontFamily: '"Schibsted Grotesk"',
          padding: '64px 72px',
        }}
      >
        {/* Top row: the lockup, and the site with its reading */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <OgLockup height={46} />
          <div style={{ display: 'flex', fontFamily: '"Geist Mono"', fontSize: 20, color: T.muted }}>
            {`${displayUrl} · ${reading}`}
          </div>
        </div>

        {/* Grade and score */}
        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 64, fontFamily: 'Fraunces' }}>
          <div style={{ display: 'flex', fontSize: 150, fontWeight: 700, lineHeight: 1, color: gradeColor }}>{grade}</div>
          <div style={{ display: 'flex', marginLeft: 22, fontSize: 150, fontWeight: 700, lineHeight: 1, color: T.ink }}>
            {fmtScore(score.score ?? 0)}
          </div>
          <div style={{ display: 'flex', marginLeft: 22, fontFamily: '"Geist Mono"', fontSize: 34, color: T.muted }}>/100</div>
        </div>

        {/* The grade band, this grade lit */}
        <div style={{ display: 'flex', marginTop: 28, width: 640 }}>
          {BANDS.map((b, i) => (
            <div
              key={b.grade}
              style={{
                display: 'flex',
                flexGrow: b.span,
                flexBasis: 0,
                height: 10,
                marginLeft: i === 0 ? 0 : 6,
                borderRadius: 5,
                background: b.color,
                opacity: b.grade === grade ? 1 : 0.28,
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', marginTop: 26, fontSize: 30, fontWeight: 500, color: T.ink }}>
          <span style={{ fontWeight: 700 }}>{lead}</span>
          <span>{rest}</span>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            width: '100%',
            marginTop: 'auto',
          }}
        >
          <div style={{ display: 'flex', fontFamily: '"Geist Mono"', fontSize: 22, color: T.muted }}>designesy.org/score</div>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 500, color: T.mutedDim }}>{OG_ENDORSEMENT}</div>
        </div>
      </div>
    ),
    { ...size, fonts: ogFonts() }
  );
}
