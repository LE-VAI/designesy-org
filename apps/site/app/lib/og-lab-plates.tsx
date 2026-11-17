import type { ReactNode } from 'react';
import { acousticTokens } from './acoustic-tokens';
import { MARK_BODY, MARK_DOT } from './brand-logotype';
import { labs } from './labs';
import { OG_T } from './og-card';

/**
 * Share-card plates for the labs: each lab's card shows what the lab
 * measures, in the tile's place, where the icon family has no icon for it.
 * A plate is the card's raised tile, wider, holding a figure drawn from the
 * lab's own values. Azure appears only in a dot, as on every other card.
 *
 * The card renderer draws no SVG text, so every label is a positioned box.
 */
const PLATE = { width: 302, height: 228 } as const;
const MONO = '"Atkinson Hyperlegible Mono"';

function Plate({ children, padding = 0 }: { children: ReactNode; padding?: number | string }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: PLATE.width,
        height: PLATE.height,
        padding,
        borderRadius: 32,
        overflow: 'hidden',
        background: OG_T.tile,
        border: `1px solid ${OG_T.tileLine}`,
      }}
    >
      {children}
    </div>
  );
}

/** The labs index: the four labs by number and name, with their rule counts. */
export function LabIndexPlate() {
  const rows = [labs.poise, labs.takt, labs.cadence, labs.acoustics];
  return (
    <Plate padding="14px 24px">
      {rows.map((lab, i) => (
        <div
          key={lab.id}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            height: 50,
            paddingTop: 13,
            borderTop: i === 0 ? 'none' : `1px solid ${OG_T.tileLine}`,
          }}
        >
          <div style={{ display: 'flex', width: 40, fontFamily: MONO, fontSize: 15, color: OG_T.mutedDim }}>
            {String(i + 1).padStart(2, '0')}
          </div>
          <div style={{ display: 'flex', flexGrow: 1, fontSize: 23, fontWeight: 500, color: OG_T.ink }}>{lab.title}</div>
          <div style={{ display: 'flex', fontFamily: MONO, fontSize: 15, color: OG_T.muted }}>
            {lab.contract_rules.length} rules
          </div>
        </div>
      ))}
    </Plate>
  );
}

/** Poise: the mark at rest, the thing the lab makes respond to touch. */
export function PoisePlate() {
  return (
    <Plate>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={86} height={134} viewBox="112 40 254 396">
          {MARK_BODY.map((d, i) => (
            <path key={i} d={d} fill={OG_T.logo} />
          ))}
          <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill={OG_T.signal} />
        </svg>
      </div>
    </Plate>
  );
}

/**
 * Takt: one corner drawn with its dimensions. The outer radius is the inner
 * radius plus the padding between the two surfaces (12 = 6 + 6), the lab's
 * concentric radii rule. The dot marks the centre both arcs share.
 */
export function TaktPlate() {
  const label = (text: string, left: number, top: number) => (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        display: 'flex',
        fontFamily: MONO,
        fontSize: 18,
        color: OG_T.muted,
      }}
    >
      {text}
    </div>
  );
  return (
    <Plate>
      <svg
        width={PLATE.width}
        height={PLATE.height}
        viewBox={`0 0 ${PLATE.width} ${PLATE.height}`}
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <path d="M50 228 V172 A96 96 0 0 1 146 76 H302" fill="none" stroke={OG_T.ink} strokeWidth={3} strokeLinecap="round" />
        <path d="M98 228 V172 A48 48 0 0 1 146 124 H302" fill="none" stroke={OG_T.ink} strokeWidth={3} strokeLinecap="round" />
        <path d="M146 172 L78.1 104.1" fill="none" stroke={OG_T.mutedDim} strokeWidth={1.5} strokeDasharray="4 4" />
        <path d="M108.1 142.1 l7.8 -7.8" fill="none" stroke={OG_T.mutedDim} strokeWidth={1.5} />
        <path d="M214 76 V124" fill="none" stroke={OG_T.mutedDim} strokeWidth={1.5} strokeDasharray="4 4" />
        <path d="M208 76 h12 M208 124 h12" fill="none" stroke={OG_T.mutedDim} strokeWidth={1.5} />
        <circle cx={146} cy={172} r={7} fill={OG_T.signal} />
      </svg>
      {label('12', 48, 70)}
      {label('6', 110, 152)}
      {label('6', 228, 88)}
    </Plate>
  );
}

/** Cadence: three lines of type and the tracking each one takes. */
export function CadencePlate() {
  const row = (sample: ReactNode, value: string, first = false) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingTop: first ? 0 : 12,
        paddingBottom: 12,
        borderTop: first ? 'none' : `1px solid ${OG_T.tileLine}`,
      }}
    >
      {sample}
      <div style={{ display: 'flex', fontFamily: MONO, fontSize: 15, color: OG_T.mutedDim }}>{value}</div>
    </div>
  );
  return (
    <Plate padding="0 24px">
      {row(
        <div style={{ display: 'flex', fontFamily: 'Fraunces', fontSize: 42, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.08, color: OG_T.ink }}>
          Rhythm
        </div>,
        '-0.02em',
        true,
      )}
      {row(<div style={{ display: 'flex', fontSize: 20, fontWeight: 500, color: OG_T.muted }}>of text on a page</div>, '0')}
      {row(
        <div style={{ display: 'flex', fontFamily: MONO, fontSize: 15, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG_T.ink }}>
          Labels
        </div>,
        '+0.18em',
      )}
    </Plate>
  );
}

/** Acoustics: every cue token by name, read from the acoustic token module. */
export function CuesPlate() {
  const names = acousticTokens.tokens.map((cue) => cue.token.replace('--cue:', ''));
  const perColumn = Math.ceil(names.length / 2);
  const columns = [names.slice(0, perColumn), names.slice(perColumn)];
  return (
    <Plate>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 36 }}>
        {columns.map((column, c) => (
          <div key={c} style={{ display: 'flex', flexDirection: 'column' }}>
            {column.map((name) => (
              <div key={name} style={{ display: 'flex', fontFamily: MONO, fontSize: 16, lineHeight: 1.25, color: OG_T.muted }}>
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Plate>
  );
}
