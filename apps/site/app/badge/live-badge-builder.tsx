'use client';

// The /badge page's lead: type a site, see its live badge, copy the embed.
//
// The badge image is GET /api/badge?url=<site>, drawn from the score cache
// (lib/badge/live-badge-route.ts). The preview and the snippets change on
// submit, never per keystroke: every new site in an <img> asks the badge
// route for that site, and a half-typed domain is a site of its own.

import { useState } from 'react';
import { EngineBar, Segmented, checkUrl } from '../lib/engine/command-bar';
import { SnippetCopy } from './snippet-copy';

const ORIGIN = 'https://www.designesy.org';

type Ground = 'dark' | 'light';

const GROUNDS: { value: Ground; label: string; hint: string }[] = [
  { value: 'dark', label: 'Dark', hint: 'The badge on ink, for light pages. The default.' },
  { value: 'light', label: 'Light', hint: 'The badge on white, for dark pages: adds theme=light.' },
];

// The paper each specimen sits on: the host page the ground is made for.
const PAPER: Record<Ground, string> = { dark: '#f3f4f6', light: '#0a0a0a' };

/** The site a typed value names, as the badge route will read it (host and port), or null. */
function siteHost(raw: string): string | null {
  const c = checkUrl(raw, 'site');
  if (!c?.ok || !c.target) return null;
  try {
    return new URL(c.target).host.toLowerCase();
  } catch {
    return null;
  }
}

/** The embed code for a site, and the same badge from this server for the preview. */
function embed(host: string, ground: Ground) {
  const query = `url=${encodeURIComponent(host)}${ground === 'light' ? '&theme=light' : ''}`;
  const src = `${ORIGIN}/api/badge?${query}`;
  const href = `${ORIGIN}/score?url=${encodeURIComponent(host)}`;
  const alt = `Scored by Designesy: live score for ${host}`;
  return {
    preview: `/api/badge?${query}`,
    alt,
    snippets: [
      {
        id: 'html',
        label: 'HTML',
        code: `<a href="${href}" target="_blank" rel="noopener">
  <img src="${src.replace(/&/g, '&amp;')}"
       alt="${alt}"
       height="44" />
</a>`,
      },
      { id: 'markdown', label: 'Markdown', code: `[![${alt}](${src})](${href})` },
    ],
  };
}

export function LiveBadgeBuilder({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [host, setHost] = useState(initial);
  const [ground, setGround] = useState<Ground>('dark');
  const e = embed(host, ground);

  return (
    <>
      <EngineBar
        fields={[
          {
            value,
            onChange: setValue,
            label: 'Site to draw the live badge for',
            placeholder: 'Your site, like example.com',
            reads: 'site',
          },
        ]}
        onSubmit={() => {
          const next = siteHost(value);
          if (next) setHost(next);
        }}
        busy={false}
        go="Show badge"
        goBusy="Drawing"
        choices={<Segmented<Ground> label="Ground" value={ground} onChange={setGround} options={GROUNDS} />}
        note="Draws the site's live badge from the score cache and writes its embed code."
      />
      {/* One card per format on the 7-line, as the static snippets below: the
          code in the face, the live badge it draws in the side pane. */}
      <div className="badge-snippets badge-live-snippets">
        {e.snippets.map((s) => (
          <div key={s.id} className="badge-snippet">
            <div className="badge-snippet-face">
              <div className="badge-snippet-label">
                <h3 className="badge-snippet-name">{s.label}</h3>
                <SnippetCopy text={s.code} label={`${s.label} live badge snippet`} />
              </div>
              <pre className="badge-snippet-code" data-scroll-region={`${s.label} live badge snippet`}>
                <code>{s.code}</code>
              </pre>
            </div>
            <figure className="badge-snippet-side">
              <figcaption className="badge-snippet-label">
                <span className="badge-snippet-name">Renders as</span>
                <span className="badge-snippet-dim">{host}</span>
              </figcaption>
              <div className="badge-snippet-specimen" style={{ background: PAPER[ground] }}>
                {/* The real badge for this site. Lazy, so a cold score never
                    holds the page's load event. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={e.preview}
                  className="badge-live-img"
                  src={e.preview}
                  alt={e.alt}
                  height={44}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </figure>
          </div>
        ))}
      </div>
    </>
  );
}
