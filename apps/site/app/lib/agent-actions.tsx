'use client';

/**
 * Page-level agent affordances for prose routes.
 *
 * WHAT THIS IS FOR
 * Humans who want to hand a page to an agent. It is NOT what makes the site
 * agent-readable — that is content negotiation on the page itself, which already
 * ships. The research is blunt on this: no measurement shows copy buttons change
 * agent behaviour, and the agent-side channel is the Accept header. So this is a
 * human convenience, sized accordingly.
 *
 * TWO CONTROLS, AND WHY NOT FOUR
 * "Open in Claude" and "Open in ChatGPT" deeplinks were built, verified working,
 * and then deliberately removed:
 *
 *   - Claude's `claude.ai/new?q=` IS officially documented, but truncates `q` at
 *     roughly 14,000 characters. /methodology's markdown is 36,000, so passing
 *     page content would silently lose its second half in the composer. Passing
 *     a URL instead sidesteps that — but see the next point.
 *   - ChatGPT's `chatgpt.com/?q=` works in production across several sites but
 *     OpenAI has never documented it. It can stop working with no notice and no
 *     changelog.
 *
 * A convenience control that silently rots is worse than one never offered: the
 * reader clicks, nothing useful happens, and the failure looks like their own
 * mistake. The two that remain cannot rot — one reads a URL this site serves,
 * the other reads the clipboard.
 *
 * The label follows Mintlify's plain "Copy page" rather than Anthropic's longer
 * "Copy page as Markdown for LLMs" — both ship in the wild, and the short form
 * keeps the row from crowding on narrow screens. The accessible name carries the
 * full meaning for screen readers.
 */

import { useCallback, useState } from 'react';

export function AgentActions({ mdPath, label }: { mdPath: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      const res = await fetch(mdPath, { headers: { Accept: 'text/markdown' } });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fail visibly to the reader rather than pretending it worked. A silent
      // copy failure looks identical to a successful one, which is how someone
      // pastes an empty string into an agent and blames the content.
      setCopied(false);
      window.open(mdPath, '_blank', 'noopener,noreferrer');
    }
  }, [mdPath]);

  return (
    <div className="agent-actions">
      <button
        type="button"
        className="agent-action"
        onClick={onCopy}
        aria-label={copied ? 'Copied page markdown to clipboard' : `Copy ${label} as Markdown for LLMs`}
        title={copied ? 'Copied' : `Copy ${label} as Markdown for LLMs`}
        // Deliberately not disabled when clipboard is unavailable: the fallback
        // opens the markdown, which is still useful. Disabling would hide a
        // working path.
        data-copied={copied ? 'true' : undefined}
      >
        {copied ? 'Copied' : 'Copy page'}
      </button>
      <a
        className="agent-action"
        href={mdPath}
        aria-label={`View ${label} as Markdown`}
        title={`View ${label} as Markdown`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View as Markdown
      </a>
      {/*
        Two controls, not four. "Open in Claude" and "Open in ChatGPT" anchors
        were built and then removed deliberately:

          - Claude's `claude.ai/new?q=` IS officially documented, with a ~14,000
            character truncation limit on `q`.
          - ChatGPT's `chatgpt.com/?q=` works in production across several sites
            but OpenAI has never documented it, so it can stop working with no
            notice and no changelog.

        A convenience control that silently rots is worse than one that was never
        offered: the reader clicks, nothing useful happens, and the failure is
        indistinguishable from their own mistake. The two that remain cannot rot
        -- one reads a URL the site serves, the other reads the clipboard.
      */}
    </div>
  );
}
