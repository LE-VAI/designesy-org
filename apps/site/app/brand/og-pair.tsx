import { designSystemContract } from '../lib/design-system-contract';
import { MARK_BODY, MARK_DOT } from '../lib/brand-logotype';
import { OG_T, renderOgCard } from '../lib/og-card';

const COLORS = designSystemContract.colors;
const AZURE = COLORS.signal.value.toUpperCase();
const FLAME = COLORS.activation.value.toUpperCase();
const INK = COLORS.paper.value.toUpperCase();
const WHITE = COLORS.paper_white.value.toUpperCase();

export const BRAND_CARD_ALT = 'Designesy Brand: the flame is Azure, inverted';

/** One half of the pair: the mark, its viewBox the art box, on its ground. */
function Half({ ground, body, dot }: { ground: string; body: string; dot: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 150,
        height: '100%',
        background: ground,
      }}
    >
      <svg width={82} height={128} viewBox="112 40 254 396">
        {MARK_BODY.map((d, i) => (
          <path key={i} d={d} fill={body} />
        ))}
        <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill={dot} />
      </svg>
    </div>
  );
}

/**
 * The /brand share card: the page's own picture in the tile's place, the mark
 * in Azure on ink beside its inverse in the flame on white (the hero pair).
 * The page leaves the endorsement line off (D71), so the card does too.
 */
export function renderBrandCard() {
  return renderOgCard({
    eyebrow: 'Brand',
    title: 'The flame is Azure, inverted.',
    lede: `Designesy's blue is ${AZURE}. Invert it, the way Ctrl+I inverts a screen, and you get ${FLAME}.`,
    path: 'designesy.org/brand',
    endorsement: false,
    art: (
      <div
        style={{
          display: 'flex',
          width: 302,
          height: 230,
          borderRadius: 32,
          overflow: 'hidden',
          border: `1px solid ${OG_T.tileLine}`,
        }}
      >
        <Half ground={INK} body={WHITE} dot={AZURE} />
        <Half ground={WHITE} body={INK} dot={FLAME} />
      </div>
    ),
  });
}
