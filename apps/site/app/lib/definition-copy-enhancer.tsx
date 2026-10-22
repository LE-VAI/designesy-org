'use client';

import { useEffect } from 'react';

/**
 * Auto-enhances all .definition elements with click-to-copy behavior.
 * Added once to the root layout; works across all pages via
 * MutationObserver that catches new definitions on navigation.
 *
 * Copy payload resolution (most useful first):
 * 1. data-copy attribute — explicit agent-ready / paste-ready payload
 * 2. Visible value text — excludes .definition-label and badge
 *
 * Optional data-copy-label customizes the badge (e.g. "agent prompt").
 */
export function DefinitionCopyEnhancer() {
  useEffect(() => {
    // Ids for the hidden description spans, unique across the page.
    let descCount = 0;
    const extractVisibleValue = (def: HTMLElement): string => {
      const clone = def.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('.definition-label, .definition-copy-badge, .definition-copy-desc')
        .forEach((el) => el.remove());
      return clone.textContent?.trim() ?? '';
    };

    const enhance = (def: HTMLElement) => {
      if (def.classList.contains('is-copyable')) return;
      if (def.tagName === 'BUTTON') return;

      // Prefer explicit paste payload over visible display text.
      // Share/handoff lines display a human line but copy the agent prompt.
      const explicit = def.getAttribute('data-copy')?.trim() ?? '';
      const textToCopy = explicit || extractVisibleValue(def);
      if (!textToCopy) return;

      const copyLabel =
        def.getAttribute('data-copy-label')?.trim() || 'text';

      // WCAG 4.1.2 nested-interactive: when this container becomes a button,
      // inner interactive descendants cannot remain reachable by keyboard
      // or AT (axe-core nested-interactive). Non-interactive descendants
      // (spans, strong, em, etc.) stay readable — only focusables are
      // demoted. Use both tabindex=-1 AND aria-hidden=true on the strict
      // interactive subset so they disappear from the a11y tree.
      // axe-core nested-interactive: even WITH aria-hidden="true", an
      // interactive descendant that still carries interactive semantics
      // (positive/zero tabindex or an <button>/<a> that remains focusable)
      // is a failure ("a11y can still reach it"). We already set
      // tabindex="-1" + aria-hidden="true", which hides it for screen
      // readers — but the axe rule still wants proof the element cannot be
      // reached by assistive tech. For <button> descendants: set
      // disabled=true (semantic "not actionable", no a11y-tree interactivity).
      // For <a> descendants: remove the href → anchor without href is
      // presentational (no link role), which fully clears the rule.
      // Original interactive affordances are preserved:
      //   - buttons: stashed href/aria-disabled on data-* for restore
      //   - anchors: href stashed on data-dce-href, visual "link" still obvious
      //     from surrounding copy; the whole definition is a copy-target.
      def.querySelectorAll('a, button, [tabindex]').forEach((el) => {
        // An anchor with no tabindex or role of its own is inert once its href
        // is gone, so it is neither hidden nor given a tabindex: its words stay
        // in the card's name, which is read from the card's content.
        if (el.tagName === 'A' && !el.hasAttribute('tabindex') && !el.hasAttribute('role')) {
          const href = el.getAttribute('href');
          if (href) {
            el.setAttribute('data-dce-href', href);
            el.removeAttribute('href');
          }
          return;
        }
        const existingTabindex = el.getAttribute('tabindex');
        if (existingTabindex === null || existingTabindex === '0') {
          el.setAttribute('tabindex', '-1');
        }
        el.setAttribute('aria-hidden', 'true');
        if (el.tagName === 'A') {
          const href = el.getAttribute('href');
          if (href) {
            el.setAttribute('data-dce-href', href);
            el.removeAttribute('href');
          }
        } else if (el.tagName === 'BUTTON') {
          (el as HTMLButtonElement).disabled = true;
          el.setAttribute('aria-disabled', 'true');
        }
      });

      def.classList.add('is-copyable');
      def.setAttribute('role', 'button');
      def.setAttribute('tabindex', '0');

      const badge = document.createElement('span');
      badge.className = 'definition-copy-badge';
      badge.textContent = 'Copy';
      badge.setAttribute('aria-hidden', 'true');
      def.appendChild(badge);

      // The card is named by what it shows (WCAG 2.5.3, Label in Name): an
      // aria-label of "Copy definition" did not contain the card's visible
      // text, and axe-core 4.14 fails that, so a voice user saying the words
      // they see reached nothing. "Copy <label>" and "Copied" are now the
      // description, read from a hidden span (a description reads hidden
      // text that it names).
      const copyWords = explicit
        ? `Copy ${copyLabel}`
        : `Copy ${copyLabel === 'text' ? 'definition' : copyLabel}`;
      const desc = document.createElement('span');
      desc.className = 'definition-copy-desc';
      desc.id = `dce-${++descCount}`;
      desc.hidden = true;
      desc.textContent = copyWords;
      def.appendChild(desc);
      def.setAttribute('aria-describedby', desc.id);

      let resetTimer: ReturnType<typeof setTimeout> | undefined;

      const handleCopy = async (e: Event) => {
        e.stopPropagation();
        try {
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(textToCopy);
          } else {
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          badge.textContent = 'Copied';
          desc.textContent = 'Copied';
          def.classList.add('is-copied');
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            badge.textContent = 'Copy';
            desc.textContent = copyWords;
            def.classList.remove('is-copied');
          }, 1600);
        } catch {
          /* clipboard unavailable */
        }
      };

      def.addEventListener('click', handleCopy);
      def.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCopy(e);
        }
      });
    };

    const scan = (root: ParentNode) => {
      root
        .querySelectorAll('.definition:not(.is-copyable)')
        .forEach((el) => enhance(el as HTMLElement));
    };

    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as HTMLElement;
          if (el.classList?.contains('definition')) enhance(el);
          el.querySelectorAll?.('.definition:not(.is-copyable)').forEach((d) => {
            enhance(d as HTMLElement);
          });
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
