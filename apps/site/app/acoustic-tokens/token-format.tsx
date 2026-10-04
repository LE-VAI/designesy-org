import { acousticTokens } from '../lib/acoustic-tokens';
import './token-format.css';

/** The reference token, pretty-printed once at build: one pair per line. */
const FORMAT = JSON.stringify(
  JSON.parse(acousticTokens.standards_context.reference_format),
  null,
  2,
);

/**
 * Standards context as one instrument: the reference format (the artifact
 * itself) in the face as real code, and the standards facts beside it as
 * key/value rows on the 7-line (P2's face/side definition). It replaces
 * three identical full-width callouts whose text ended about 450px short of
 * their cards, and a JSON line that broke inside a key on a phone. Used by
 * /acoustic-tokens and the close of /labs/acoustics, so the two cannot
 * drift. The card copies the reference format (the definition copy
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
          <code>{FORMAT}</code>
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
