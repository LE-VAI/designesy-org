import { renderOgCard } from '../../lib/og-card';
import { SEED, type Grade } from '../../leaderboard/seed';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Framework Evaluation';

function slugify(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = SEED.find((s) => slugify(s.url) === slug);

  if (!site) {
    return renderOgCard({
      eyebrow: 'Framework',
      title: 'Evaluation',
      lede: 'Site not found in the scored cohort.',
      path: 'designesy.org/frameworks',
    });
  }

  const score = site.score as number;
  const grade = site.grade as Grade;
  return renderOgCard({
    eyebrow: 'Framework',
    title: `${site.name} · Grade ${grade}`,
    lede: `${score}/100 · ${site.pass} passed · ${site.fail} failed · ${site.warn} warned`,
    path: `designesy.org/frameworks/${slug}`,
    badge: grade,
  });
}