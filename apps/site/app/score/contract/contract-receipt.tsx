'use client';

// The receipt (WIREFRAMES W11): enough to run the same score again and
// compare. The verdict digest and the contract's digest in 8-character groups
// (read in chunks), the versions as the run reported them (equal to
// ENGINE_VERSION and CONTRACT_VERSION of the deployed build), when the page
// was read, and the DESIGN.md linter's own line where it read the file.
// Copy receipt and Download JSON for every result; Copy link only for a
// linked contract, because a pasted or uploaded one is never stored. Each
// copy confirms in words for at least 2.5 seconds, and is announced.

import { useEffect, useRef, useState } from 'react';
import { LintLine } from './contract-problems';
import { RECEIPT_NOTE, downloadName, groups8, readAt, shareNote, type LinterTotals, lintLine } from './copy';

const HOLD_MS = 2600;

export function ContractReceipt({
  idp,
  verdictDigest,
  contractDigest,
  checkCount,
  format,
  how,
  engineVersion,
  contractVersion,
  linter,
  retrievedAt,
  receiptText,
  json,
  site,
  shareUrl,
  say,
}: {
  idp: string;
  verdictDigest: string | null;
  contractDigest: string;
  checkCount: number;
  format: string;
  how: 'pasted' | 'uploaded' | 'linked';
  engineVersion: string;
  contractVersion: string;
  linter: LinterTotals | null;
  retrievedAt: string;
  receiptText: string;
  /** The response body as delivered, for Download JSON. */
  json: unknown;
  site: string;
  /** A linked contract's deep link; null for a pasted or uploaded one. */
  shareUrl: string | null;
  say: (msg: string) => void;
}) {
  const [copied, setCopied] = useState<'receipt' | 'link' | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const at = readAt(retrievedAt);
  const lint = lintLine(linter);
  const headId = `${idp}cf-receipt-h`;

  const copy = async (what: 'receipt' | 'link', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // The clipboard refused: the label does not claim a copy that did not happen.
    }
    setCopied(what);
    say(what === 'receipt' ? 'Receipt copied' : 'Link copied');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), HOLD_MS);
  };

  const download = () => {
    const name = downloadName(site, new Date());
    const blob = new Blob([`${JSON.stringify(json, null, 2)}\n`], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    say(`Downloading ${name}.`);
  };

  return (
    <section className="eg-section cf-receipt-section" aria-labelledby={headId}>
      <div className="eg-section-head">
        <div>
          <h2 className="eg-h2" id={headId}>
            Receipt
          </h2>
          <p className="eg-section-sub">enough to run the same score again and compare</p>
        </div>
      </div>
      <div className="cf-panel">
        <dl className="cf-receipt">
          {verdictDigest && (
            <div>
              <dt>Verdict digest</dt>
              <dd>
                <span className="cf-digest">{groups8(verdictDigest)}</span>
                <small>sha256 of all {checkCount} check results, fidelity first</small>
              </dd>
            </div>
          )}
          <div>
            <dt>Your contract</dt>
            <dd>
              <span className="cf-digest">{groups8(contractDigest)}</span>
              <small>
                sha256 of your tokens as read · {format} · {how}
              </small>
            </dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd>
              {engineVersion} · baseline rules {contractVersion}
            </dd>
          </div>
          <div>
            <dt>Read at</dt>
            <dd>
              {at.z} <small>({at.local})</small>
            </dd>
          </div>
        </dl>
        {lint && <LintLine lint={lint} className="cf-lint-receipt" />}
        <p>{RECEIPT_NOTE}</p>
        <div className="cf-actions">
          <button type="button" className="eg-share-btn" onClick={() => copy('receipt', receiptText)}>
            {copied === 'receipt' ? 'Receipt copied' : 'Copy receipt'}
          </button>
          <button type="button" className="eg-share-btn" onClick={download}>
            Download JSON
          </button>
          {shareUrl && (
            <button type="button" className="eg-share-btn" onClick={() => copy('link', shareUrl)}>
              {copied === 'link' ? 'Link copied' : 'Copy link'}
            </button>
          )}
        </div>
        <div className="cf-quiet">
          <p>{shareNote(how)}</p>
        </div>
      </div>
    </section>
  );
}
