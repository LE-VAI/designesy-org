// /spring-validator — Spring-physics accessibility validation.
//
// No one validates spring-based motion against an accessibility/reduced-motion
// contract. M3 Expressive ships spring physics with no published reduced-motion
// token. This tool simulates a spring's response from its physical parameters
// (stiffness, damping, mass), determines whether it produces visible overshoot,
// and flags whether the reduced-motion implementation should suppress it.
//
// Pattern from MATERIAL_DESIGN_3_AUDIT.md §10.G:
// "No one validates spring-based motion against an accessibility/reduced-motion
// contract. Designesy should develop spring-physics validation: 'This spring's
// damping ratio produces visible overshoot — does your reduced-motion
// implementation suppress it?'"

import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { SpringValidator } from './spring-validator-form';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Spring Physics Validator',
  description:
    'Validate spring-based motion against an accessibility contract. Input stiffness, damping, and mass — get the damping ratio, overshoot percentage, settle time, and a reduced-motion recommendation. No one else validates spring physics against reduced-motion requirements.',
  path: '/spring-validator',
  ogTitle: 'Spring Physics Validator · Designesy',
  ogDescription:
    'Simulate spring motion, compute overshoot, and get a reduced-motion accessibility recommendation. The first spring-physics validation tool.',
  twitterDescription: 'Spring physics validator — designesy.org/spring-validator',
});

export default function SpringValidatorPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Motion frontier</p>
          <h1 className="surface-title" data-scramble>Spring Physics Validator</h1>
          <p className="surface-lede">
            Spring-based motion is the frontier — M3 Expressive, iOS, Framer
            Motion, React Spring. But no one validates whether a spring&apos;s
            physics produce overshoot that violates reduced-motion requirements.
            Until now.
          </p>
          <p className="surface-note">
            Input stiffness, damping, and mass. Get the damping ratio,
            overshoot percentage, settle time, and an accessibility verdict:
            does this spring require explicit reduced-motion suppression?
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <SpringValidator />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">Why this exists</h2>
          <p className="surface-note" style={{ marginBottom: '1rem', maxWidth: '70ch' }}>
            Material Design 3 Expressive introduced spring-based motion backed
            by 46 research studies. But M3 has <em>no published reduced-motion
            token</em> for springs. The spec describes spring physics (damping,
            response) but does not address what happens when a user has
            <code style={{ fontSize: '0.85rem' }}> prefers-reduced-motion: reduce</code>
            set and a spring with a low damping ratio produces visible overshoot.
          </p>
          <p className="surface-note" style={{ marginBottom: '1rem', maxWidth: '70ch' }}>
            This is a green-field validation capability. The Designesy contract
            already ships spring tokens (<code style={{ fontSize: '0.85rem' }}>damping: 1.0,
            response: 0.4</code> for default, <code style={{ fontSize: '0.85rem' }}>damping: 0.8,
            response: 0.3</code> for momentum). This tool lets anyone verify
            whether their spring parameters are safe for vestibular sensitivity —
            or whether they need an explicit reduced-motion fallback.
          </p>
          <p className="surface-note" style={{ maxWidth: '70ch' }}>
            The physics: a spring&apos;s damping ratio (ζ) determines its
            behavior. ζ &gt; 1 is overdamped (no overshoot, slow). ζ = 1 is
            critically damped (no overshoot, fastest settle). 0 &lt; ζ &lt; 1 is
            underdamped (overshoots, oscillates). The lower the damping ratio,
            the more visible the overshoot — and the more likely it triggers
            vestibular discomfort in sensitive users.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}