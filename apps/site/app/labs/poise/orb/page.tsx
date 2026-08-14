import type { Metadata } from 'next';
import Link from 'next/link';
import './orb.css';
import { Topbar } from '../../../lib/topbar';
import { Footer } from '../../../lib/footer';
import { OrbLab } from './orb-lab';
import { pageMeta } from '../../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Orb',
  description:
    'A 32KB WebGL2 orb in Designesy blue. Tweak the six parameters that matter; export a one-line embed for your own page. No build, no dependency, no account.',
  path: '/labs/poise/orb',
  ogTitle: 'Orb · Poise Lab experiment',
  ogDescription:
    'A 32KB WebGL2 orb in Designesy blue — colors, flow, light. Edit any parameter; export a one-line embed.',
  twitterDescription:
    'Orb — Designesy-blue WebGL2 shader lab at designesy.org/labs/poise/orb',
});

export default function OrbLabPage() {
  return (
    <>
      <Topbar />
      <main id="main-content" className="surface-page orb-lab-page">
        <section className="orb-hero">
          <p className="surface-eyebrow">
            <Link href="/labs" className="lab-crumb">
              Labs
            </Link>
            <span aria-hidden="true"> · </span>
            <Link href="/labs/poise" className="lab-crumb">
              Poise
            </Link>
            <span aria-hidden="true"> · </span>
            Experiment
          </p>
          <h1 className="orb-hero-title">A quiet surface that knows how to look alive.</h1>
          <p className="orb-hero-lede">
            Orb is a 32KB WebGL2 shader in Designesy blue — colors, flow, light.
            Edit any of the six parameters that matter; export a one-line embed
            for your own page. No build, no dependency, no account.
          </p>
        </section>

        <section className="orb-stage-wrap" aria-label="Live orb preview">
          <OrbLab />
        </section>

        <footer className="orb-attr" aria-label="Attribution">
          <p>
            Orb Editor by{' '}
            <a
              href="https://x.com/m_strba"
              target="_blank"
              rel="noopener noreferrer"
              className="orb-attr-link"
            >
              Martin Štrba
            </a>
            {' · '}
            <a
              href="https://postgeneric.com"
              target="_blank"
              rel="noopener noreferrer"
              className="orb-attr-link"
            >
              postgeneric
            </a>
            {' · '}
            <a
              href="https://orb-pg.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="orb-attr-link"
            >
              original editor
            </a>
            . Painted in Designesy blue for the Poise lab.
          </p>
        </footer>
      </main>
      <Footer />
    </>
  );
}