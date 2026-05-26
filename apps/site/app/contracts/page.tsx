import Link from 'next/link';

export default function ContractsPage() {
  return (
    <main className="surface-page">
      <Link className="surface-back" href="/">
        Designesy
      </Link>
      <section className="surface-hero" aria-labelledby="contracts-title">
        <p className="eyebrow">Preview surface / design contracts</p>
        <h1 id="contracts-title">Contracts</h1>
        <p className="lede">
          Design contracts turn principles into reusable operating rules for
          artifacts, interfaces, and review.
        </p>
        <p className="surface-note">
          These are design contracts: public artifact discipline, not legal
          advice or client service agreements.
        </p>
      </section>

      <section className="surface-grid" aria-label="Contracts preview areas">
        <article className="surface-card">
          <span>Principles</span>
          <p>Clear ideas that explain why a design decision exists.</p>
        </article>
        <article className="surface-card">
          <span>Rules</span>
          <p>Reusable constraints for shaping repeatable public work.</p>
        </article>
        <article className="surface-card">
          <span>Verification</span>
          <p>Checks that keep contracts reviewable before promotion.</p>
        </article>
      </section>
    </main>
  );
}
