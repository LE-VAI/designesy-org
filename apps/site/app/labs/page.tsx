import Link from 'next/link';

export default function LabsPage() {
  return (
    <main className="surface-page">
      <Link className="surface-back" href="/">
        Designesy
      </Link>
      <section className="surface-hero" aria-labelledby="labs-title">
        <p className="eyebrow">Preview surface / controlled experiments</p>
        <h1 id="labs-title">Labs</h1>
        <p className="lede">
          A lane for experiments and prototypes that can be reviewed before
          they become public rules.
        </p>
        <p className="surface-note">
          Labs are exploratory. They do not claim that products, services, or
          deployments are live.
        </p>
      </section>

      <section className="surface-grid" aria-label="Labs preview areas">
        <article className="surface-card">
          <span>Prototype notes</span>
          <p>Small experiments with clear purpose and review criteria.</p>
        </article>
        <article className="surface-card">
          <span>Pattern tests</span>
          <p>Reusable ideas tested before promotion into contracts.</p>
        </article>
        <article className="surface-card">
          <span>Promotion path</span>
          <p>Evidence first, then rules; unfinished work stays labeled.</p>
        </article>
      </section>
    </main>
  );
}
