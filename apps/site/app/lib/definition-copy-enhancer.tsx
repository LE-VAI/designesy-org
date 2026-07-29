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
    const extractVisibleValue = (def: HTMLElement): string => {
      const clone = def.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('.definition-label, .definition-copy-badge')
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
      // any focusable descendants must leave the tab order or the role
      // change breaks the a11y tree. Demote them to tabindex=-1 (still
      // mouse-clickable, just not tab-focusable) so only the outer
      // button role carries focus.
      def.querySelectorAll('a, button, [tabindex]').forEach((el) => {
        const existing = el.getAttribute('tabindex');
        if (existing === null || existing === '0') {
          el.setAttribute('tabindex', '-1');
          // Track for cleanup so mutation doesn't permanently alter unrelated UI
          el.setAttribute('data-copy-enhancer-demoted', existing ?? '0');
        }
      });

      def.classList.add('is-copyable');
      def.setAttribute('role', 'button');
      def.setAttribute('tabindex', '0');
      def.setAttribute(
        'aria-label',
        explicit
          ? `Copy ${copyLabel}`
          : `Copy ${copyLabel === 'text' ? 'definition' : copyLabel}`,
      );

      const badge = document.createElement('span');
      badge.className = 'definition-copy-badge';
      badge.textContent = 'Copy';
      badge.setAttribute('aria-hidden', 'true');
      def.appendChild(badge);

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
          def.classList.add('is-copied');
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            badge.textContent = 'Copy';
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
