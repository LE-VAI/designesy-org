import { Fragment, type CSSProperties } from 'react';
import { acousticTokens } from '../lib/acoustic-tokens';
import './token-format.css';

/** The reference token, pretty-printed once at build: one pair per line. */
const FORMAT = JSON.stringify(
  JSON.parse(acousticTokens.standards_context.reference_format),
  null,
  2,
);

/** A pretty-printed object member: its indent, key, colon and space, then
 * its value, with the comma after it when there is one. */
const PAIR = /^( *"(?:[^"\\]|\\.)*": )(.+)$/;

/**
 * FORMAT one source line at a time, for the wrap in token-format.css. `head`
 * is the whole line, or a pair's indent, key, colon and space. `value` is a
 * pair's value, which the card sets as one box so a pair breaks between the
 * two. `hang` is the column a wrapped line continues in: the line's indent
 * plus two, in ch of the mono face. The pieces add no characters and drop
 * none, so the lines joined by newlines are FORMAT again.
 */
const LINES = FORMAT.split('\n').map((line) => {
  const pair = PAIR.exec(line);
  return {
    head: pair ? pair[1] : line,
    value: pair ? pair[2] : null,
    hang: `${line.search(/\S|$/) + 2}ch`,
  };
});

/**
 * Standards context as one instrument: the reference format (the artifact
 * itself) in the face as real code, and the standards facts beside it as
 * key/value rows on the 7-line (the face/side definition, globals.css). It
 * replaces three identical full-width callouts whose text ended about 450px
 * short of their cards, and a JSON line that broke inside a key on a phone.
 * Used by /acoustic-tokens and the close of /labs/acoustics, so the two
 * cannot drift. The code is one block per source line (LINES) with the
 * newlines kept between the blocks, so the text of the <code> is FORMAT
 * exactly. The card copies the reference format (the definition copy
 * enhancer reads data-copy). The proposal is the one accented value.
 */
export function TokenFormatCard() {
  return (
    <div
      className="definition definition-split token-format"
      data-copy={FORMAT}
      data-copy-label="reference format"
    >
      <div className="definition-face">
        <p className="definition-label">Reference format</p>
        <pre className="token-format-json">
          <code>
            {LINES.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? '\n' : null}
                <span
                  className="token-format-line"
                  style={{ '--hang': line.hang } as CSSProperties}
                >
                  {line.head}
                  {line.value === null ? null : (
                    <span className="token-format-value">{line.value}</span>
                  )}
                </span>
              </Fragment>
            ))}
          </code>
        </pre>
        <p>{acousticTokens.standards_context.proposed_type}</p>
      </div>
      <dl className="definition-side">
        <div>
          <dt>Standard</dt>
          <dd>W3C DTCG 2025.10</dd>
        </div>
        <div>
          <dt>Audio types</dt>
          <dd>none defined</dd>
        </div>
        <div>
          <dt>These tokens</dt>
          <dd>net-new</dd>
        </div>
        <div>
          <dt>Proposed type</dt>
          <dd className="token-format-proposal">$type: sound</dd>
        </div>
        <div>
          <dt>Namespace</dt>
          <dd>$extensions.designesy</dd>
        </div>
        <div>
          <dt>Contribution</dt>
          <dd>may be proposed to the DTCG</dd>
        </div>
      </dl>
    </div>
  );
}
