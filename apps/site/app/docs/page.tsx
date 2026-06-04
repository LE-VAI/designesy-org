import Link from 'next/link';

export default function DocsPage() {
  return (
    <main className="surface-page">
      <Link className="surface-back" href="/">
        Designesy
      </Link>
      <section className="surface-hero" aria-labelledby="docs-title">
        <p className="eyebrow">Preview surface / selected public notes</p>
        <h1 id="docs-title">Docs</h1>
        <p className="lede">
          A public index for selected Designesy notes, context, and operating
          language.
        </p>
        <p className="surface-note">
          This is an early scaffold for public documentation. Private doctrine,
          working drafts, and internal project material stay outside this
          surface.
        </p>
      </section>

      <section className="surface-grid" aria-label="Docs preview areas">
        <article className="surface-card">
          <span>Context</span>
          <p>Public orientation for what Designesy is and what is planned.</p>
        </article>
        <article className="surface-card">
          <span>Language</span>
          <p>Selected public voice and terms that keep claims grounded.</p>
        </article>
        <article className="surface-card">
          <span>Status</span>
          <p>Foundation-stage notes only; not a private-source mirror.</p>
        </article>
      </section>
    </main>
  );
}
