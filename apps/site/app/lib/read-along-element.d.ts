/**
 * Ambient types for @designesy/read-along and its custom element.
 *
 * The package ships dependency-free ES modules with no bundled declarations and
 * no @types package. We dynamic-import it only for its registration side effect
 * (`customElements.define`), so nothing is read from the module — which is why
 * this declares the module with no body rather than fabricating an API surface
 * the integration does not use.
 *
 * Two traps here, both of which fail in a way that looks like this file is
 * missing entirely:
 *
 * - `declare module 'x';` is an AMBIENT declaration and only works in a script
 *   file. Adding `export {}` to make it a module turns it into an AUGMENTATION
 *   of a module that has no types yet, which TS then reports as "could not find
 *   a declaration file". So this file must stay a script — no import, no export.
 *
 * - The JSX augmentation goes through `declare namespace React.JSX`, not a bare
 *   `declare namespace JSX`. React 19 moved the JSX namespace onto the React
 *   namespace, so augmenting the old global one compiles clean and silently does
 *   nothing — the intrinsic stays unknown.
 *
 * The filename is also deliberately not `read-along.d.ts`: an ambient file
 * sharing a basename with a sibling module (read-along.tsx) is shadowed by that
 * module and never enters the program.
 */

declare module '@designesy/read-along';

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      'read-along': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        /** BCP-47 language tag for the reader, e.g. "en". */
        lang?: string;
      };
    }
  }
}
