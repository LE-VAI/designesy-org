// @vai/icons — core runtime
//
// Three things matter at runtime:
//   1. WHAT principle the icon belongs to (which gesture family)
//   2. WHAT tier it occupies (the reduce strategy)
//   3. WHAT reduce strategy is currently active
//
// This file resolves those three and produces the correct CSS class
// for an icon. It does NOT animate — animation lives in styles/vai-icons.css
// and follows the tier under the @media (prefers-reduced-motion: reduce) block.
//
// Zero dependencies.

import manifestData from '../icons/_index.json' with { type: 'json' };

export const manifest = manifestData;

// Lookup a single icon's motion contract by name. The motion.json sidecar
// holds the full rationale and timing; the manifest holds the tier summary.
// This function reads from the manifest (cheap). To read motion.json
// individually, import it from '../icons/<name>.motion.json' directly.
export function iconContract(name) {
  const found = manifest.icons.find((i) => i.name === name);
  if (!found) throw new Error(`@vai/icons: no icon named "${name}"`);
  return found;
}

// Tier resolution under the user's current motion preference.
//
// Returns the CSS class the consumer should apply to the icon's container:
//   { class: 'vai-icon-tier1-remove' | 'vai-icon-tier2-soften' | 'vai-icon-tier3-keep',
//     reducedMotion: boolean,
//     override: 'full' | 'reduced' | null }
//
// `override` lets a developer force a tier (e.g. for testing under
// tdesktop OS preference detection latency). Default null = follow OS.
export function resolveTier(name, override = null) {
  const c = iconContract(name);
  const reduced = override === 'reduced' ? true : override === 'full' ? false : prefersReducedMotion();
  return {
    class: `vai-icon-${c.tier}-${c.reduce.split('-')[0]}`,
    raw: c,
    reducedMotion: reduced,
  };
}

// Match the @vai/motion contract — exposed here so consumers that load
// @vai/icons without @vai/motion still get a read of their prefers-reduced-motion.
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Mount an icon's SVG into a host element. Returns the host element.
//
//   import { mountIcon } from '@vai/icons';
//   const el = mountIcon('cursor-trace', document.getElementById('here'));
//
// Pass `{ motion: false }` to render the static glyph with no animation
// classes — useful when an icon is decorative-only.
export async function mountIcon(name, host, opts = {}) {
  const contract = iconContract(name);
  const tier = resolveTier(name);
  const [{ default: svgText }] = await Promise.all([
    import(`../icons/${contract.file}?raw`).catch(async () => {
      // Rollup-aware fallback: re-import without ?raw.
      const url = new URL(`../icons/${contract.file}`, import.meta.url);
      const r = await fetch(url);
      return { default: await r.text() };
    }),
  ]);

  host.classList.add('vai-icon', tier.class);
  host.setAttribute('data-vai-icon', name);
  host.setAttribute('data-vai-principle', contract.principle);
  host.setAttribute('data-vai-tier', contract.tier);
  if (opts.motion === false) {
    host.setAttribute('data-vai-static', '');
  }
  host.innerHTML = svgText.trim();
  return host;
}

// Group-level helper: list all icons that share a principle.
export function iconsByPrinciple(principle) {
  return manifest.icons.filter((i) => i.principle === principle);
}

// Group-level helper: list all icons occupying a given tier.
export function iconsByTier(tier) {
  return manifest.icons.filter((i) => i.tier === tier);
}

// Counts the manifest for the demo footer.
export function counts() {
  const by = (k) => manifest.icons.reduce((acc, i) => {
    acc[i[k]] = (acc[i[k]] || 0) + 1;
    return acc;
  }, {});
  return {
    total: manifest.icons.length,
    byPrinciple: by('principle'),
    byTier: by('tier'),
  };
}
