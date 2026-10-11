'use client';

/*
  Critical CSS for first paint (production only; see scripts/critical-css.mjs).

  The rules of globals.css that the server-rendered pages use are inlined here,
  in <head>, and the whole sheet loads without blocking paint (the loader in
  app/layout.tsx). Before this, every route waited for the whole 255 KB sheet
  before it could paint anything.

  WHY A CLIENT COMPONENT
  A server component's output travels twice: once as HTML and once inside the
  RSC payload that hydrates it, so 150 KB of inlined CSS would ship as 300 KB.
  This component reads the generated CSS only while rendering on the server
  (`typeof window` is a build-time constant, so the browser bundle contains no
  CSS and no require), and the RSC payload carries a reference to it, not the
  CSS. On the client React adopts the <style> the server sent by its href and
  does not touch its contents.

  WHY precedence="next"
  React writes every inline style of a precedence before that precedence's
  stylesheets, and Next's stylesheets all use "next". So this <style> lands
  ahead of the next/font sheet and every route sheet, which is where
  globals.css sat when it was a <link>, and the cascade order does not change.
  The loader puts the whole sheet directly after this <style>.
*/
const generated: { css: string } | null =
  typeof window === 'undefined' && process.env.NODE_ENV === 'production'
    ? require('./critical-css.generated.json')
    : null;

export function CriticalCss() {
  if (process.env.NODE_ENV !== 'production') return null;
  return (
    <style href="globals-critical" precedence="next">
      {generated ? generated.css : ''}
    </style>
  );
}
