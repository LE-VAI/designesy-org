// /m3-bridge — Material 3 token → W3C DTCG format converter.
//
// M3's DSP (Design System Package) export was archived October 2024 and does
// not emit W3C DTCG format. This tool bridges the gap: paste M3 token CSS or
// JSON, get W3C DTCG 2025.10 format output. Positions Designesy as the
// neutral bridge between Google's two non-interoperating design-data
// initiatives (M3 DSP archived, DESIGN.md ships DTCG).
//
// Pattern from MATERIAL_DESIGN_3_AUDIT.md §10.B:
// "Build the M3 → DTCG bridge. Whether your tokens come from M3, DESIGN.md,
// Tokens Studio, or hand-written JSON — Designesy validates them against
// the W3C standard."

import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { M3BridgeTool } from './m3-bridge-form';
import { AgentActions } from '../lib/agent-actions';
import { EngineHead, EngineMethod, EngineNext } from '../lib/engine/engine-page';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'M3 → DTCG Bridge',
  description:
    'Convert Material 3 design tokens to W3C DTCG 2025.10 format. M3\'s DSP export was archived October 2024 and doesn\'t emit DTCG. This bridge converts M3 token CSS or JSON to the W3C standard format, then validates the output.',
  path: '/m3-bridge',
  ogTitle: 'M3 → DTCG Bridge · Designesy',
  ogDescription:
    'M3\'s DSP export is archived. Convert Material 3 tokens to W3C DTCG format: the neutral bridge between Google\'s non-interoperating design-data initiatives.',
  twitterDescription: 'M3 → DTCG bridge · designesy.org/m3-bridge',
});

export default function M3BridgePage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/m3-bridge"
          name="M3 to DTCG bridge"
          thesis="Paste Material 3 tokens, as CSS or JSON, and get W3C DTCG 2025.10 back: typed, structured and checked."
          facts={['5 checks', 'DTCG 2025.10', 'converted in your browser']}
          contract={{ href: '/contracts/tokens', label: 'token contract' }}
        >
          <AgentActions mdPath="/m3-bridge.md" label="the M3 bridge page" />
        </EngineHead>

        <M3BridgeTool />

        <EngineMethod
          steps={[
            { title: 'Read the tokens', text: '--md- custom properties from CSS, or md. keys from a JSON file.' },
            { title: 'Map the paths', text: 'Each name becomes a DTCG path: --md-sys-color-primary becomes color.primary.' },
            { title: 'Type the values', text: 'Colors, dimensions, durations, easing curves, numbers and font families, each with its $type.' },
            { title: 'Validate', text: 'Five checks against the DTCG format, before you download the file.' },
          ]}
          formula={
            <>
              <span><b>valid</b> = all five checks pass</span>
              <span>Colors are written as colorSpace and components, never as bare hex.</span>
            </>
          }
        />

        <section className="eg-section eg-prose" aria-labelledby="m3-why-h">
          <h2 className="eg-h2" id="m3-why-h">Why it exists</h2>
          <p>
            Material 3&apos;s own token export, the Design System Package, was{' '}
            <a href="https://github.com/material-foundation/material-tokens" target="_blank" rel="noopener noreferrer">
              archived on 17 October 2024
            </a>
            , and it never wrote the W3C DTCG format. No replacement has been announced.
          </p>
          <p>
            Google&apos;s DESIGN.md project does export DTCG, through{' '}
            <code><span>npx</span> <span>@google/design.md</span> <span>export</span> <span>--format</span> <span>dtcg</span></code>, and the two projects do not share a token format.
            This bridge carries M3 tokens across, then checks the result against the standard.
          </p>
        </section>

        <EngineNext
          items={[
            { title: 'Check the file against the token contract', desc: 'The rules a token file has to meet here, with the reasons behind each.', route: '/contracts/tokens' },
            { title: 'Emit a full build contract from a live site', desc: 'Guardrails writes DTCG tokens, lint rules, AGENTS.md and a DESIGN.md from any URL.', route: '/guardrails' },
            { title: 'Score the site that uses these tokens', desc: 'The contract score, drift and AI readiness on one URL, with one composite grade.', route: '/score' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
