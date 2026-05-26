import Link from 'next/link';

export default function ReviewPage() {
  return (
    <main className="surface-page">
      <Link className="surface-back" href="/">
        Designesy
      </Link>
      <section className="surface-hero" aria-labelledby="review-title">
        <p className="eyebrow">Preview surface / review discipline</p>
        <h1 id="review-title">Review</h1>
        <p className="lede">
          A public explanation of the checks Designesy uses before artifacts
          are treated as ready.
        </p>
        <p className="surface-note">
          This is review language, not a live intake workflow, approval gate, or
          access system.
        </p>
      </section>

      <section className="surface-grid" aria-label="Review preview areas">
        <article className="surface-card">
          <span>Provenance</span>
          <p>Work should show where decisions came from and what changed.</p>
        </article>
        <article className="surface-card">
          <span>Accessibility</span>
          <p>Artifacts are checked for clarity, readability, and use.</p>
        </article>
        <article className="surface-card">
          <span>Platform fit</span>
          <p>Outputs are reviewed against the place they will actually live.</p>
        </article>
      </section>
    </main>
  );
}
