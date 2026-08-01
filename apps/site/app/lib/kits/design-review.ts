/**
 * Use Kit One · Design Review
 * Portable instruction package for humans and agents.
 * Source: public Review doctrine + design system contract v0.4.0.
 */

export const designReviewKit = {
  id: 'design-review',
  number: 'One',
  version: '0.1',
  status: 'live' as const,
  title: 'Design Review',
  lede: 'Turn taste into inspection. Review any interface, system, or agent output against eight dimensions — with a portable prompt agents can run.',
  path: '/kits/design-review',
  public_url: 'https://www.designesy.org/kits/design-review',
  machine_url: 'https://www.designesy.org/kits/design-review.json',
  handoff_line:
    'Tell your agent to review with Designesy — designesy.org/kits/design-review',
  permission: 'read-only by default · report only unless edit scope is explicit',
  related: [
    {
      href: '/open',
      title: 'Open design intelligence',
      meta: 'Catalog of portable packages · human + machine',
    },
    {
      href: '/review',
      title: 'Review surface',
      meta: 'Eight dimensions and field checks',
    },
    {
      href: '/contracts/design-system',
      title: 'Design system contract v0.4.0',
      meta: 'Human home and machine export · Poise + Takt + Cadence + Acoustics adopted',
    },
    {
      href: '/review/poise',
      title: 'Field check · Poise',
      meta: 'Kit One applied to Lab One · pass with notes',
    },
    {
      href: '/review/takt',
      title: 'Field check · Takt',
      meta: 'Kit One applied to Lab Two · pass with notes',
    },
    {
      href: '/review/designesy-org',
      title: 'Field check · designesy.org',
      meta: 'Public surface review against contract v0.4.0',
    },
    {
      href: '/labs/poise',
      title: 'Lab One · Poise',
      meta: 'Source lab · interaction rules adopted in v0.1.1',
    },
    {
      href: '/labs/takt',
      title: 'Lab Two · Takt',
      meta: 'Source lab · interface-feel rules adopted in v0.1.2',
    },
    {
      href: '/labs/cadence',
      title: 'Lab Three · Cadence',
      meta: 'Source lab · typography rules adopted in v0.1.3',
    },
    {
      href: '/labs/acoustics',
      title: 'Lab Four · Acoustics',
      meta: 'Source lab · acoustic mapping rules adopted in v0.3.0',
    },
    {
      href: '/review/cadence',
      title: 'Field check · Cadence',
      meta: 'Kit One applied to Lab Three · pass with notes',
    },
    {
      href: '/review/acoustics',
      title: 'Field check · Acoustics',
      meta: 'Kit One applied to Lab Four · pass with notes',
    },
  ],
  anatomy: [
    'Purpose',
    'When to use',
    'Required inputs',
    'Permission level',
    'Eight review dimensions',
    'Agent prompt',
    'Output format',
    'Verification checklist',
    'Anti-rationalizations',
    'Anti-patterns',
    'Related contracts and surfaces',
  ],
  purpose:
    'Give people and agents a shared, portable way to judge design work by consequence — not personal taste — and return concrete, reusable findings.',
  when_to_use: [
    'Before shipping a public interface, page, or system change',
    'When agent output looks functional but may still be generic',
    'When comparing an artifact to a contract, lab, or prior field check',
    'When you need a shareable review packet instead of a private opinion',
  ],
  required_inputs: [
    {
      title: 'Artifact',
      meta: 'URL, screenshots, route, component, or document under review',
    },
    {
      title: 'Purpose claim',
      meta: 'What the design is trying to make possible (one sentence)',
    },
    {
      title: 'Audience and context',
      meta: 'Who uses it, on what device, under what stress or constraint',
    },
    {
      title: 'Governing rules',
      meta: 'Contract, lab, or prior review to measure against when available',
    },
  ],
  dimensions: [
    {
      num: '01',
      title: 'Purpose',
      desc: 'What is the design trying to make possible? Which elements directly support that purpose? What can be removed without weakening action?',
    },
    {
      num: '02',
      title: 'Clarity',
      desc: 'Is the primary action discoverable? Does the form suggest use? Do labels, hierarchy, layout, and motion reduce uncertainty?',
    },
    {
      num: '03',
      title: 'Context',
      desc: 'Where and when will this be used? What constraints shape the experience: device, bandwidth, attention, lighting, language, ability, stress, social setting, maintenance?',
    },
    {
      num: '04',
      title: 'Inclusion',
      desc: 'Who benefits most? Who has to work harder? What assumptions about body, language, culture, knowledge, money, or technology are embedded?',
    },
    {
      num: '05',
      title: 'System coherence',
      desc: 'Does this follow an existing system? If it breaks the system, is the reason explicit and worth it? Can others reuse or extend the decision?',
    },
    {
      num: '06',
      title: 'Durability',
      desc: 'Will this hold up under repeated use? Can it be maintained, repaired, localized, and adapted? Is the need more durable than the trend?',
    },
    {
      num: '07',
      title: 'Delight',
      desc: 'Does the emotional quality clarify purpose, trust, identity, learning, or human connection? Or does it distract from weak function?',
    },
    {
      num: '08',
      title: 'Responsibility',
      desc: 'What environmental, economic, social, or human costs are hidden? Does the design distribute effort fairly? What would make it more honest?',
    },
  ],
  agent_prompt: `You are running Designesy Use Kit One: Design Review.
Source: https://www.designesy.org/kits/design-review
Machine kit: https://www.designesy.org/kits/design-review.json
Open index: https://www.designesy.org/open.json
Optional contract: https://www.designesy.org/contracts/design-system
Optional machine rules: https://www.designesy.org/contracts/design-system.json

Permission: read-only by default. Report findings. Do not edit files,
deploy changes, or claim write authority the operator did not grant.

Goal: review the artifact below against eight dimensions. Lead with
consequences, not personal taste. Separate observed behavior from
derived judgment. Name tradeoffs. Identify hidden burdens. Check
missing states. Recommend concrete corrections.

If you can fetch URLs:
  1. Fetch the machine kit for structured rules.
  2. Fetch the contract machine rules if a governing system applies.
  3. Cite contract tokens when proposing UI changes.

If you cannot fetch URLs:
  Use the dimensions and output format below. They are self-contained.

---

ARTIFACT:
{{ARTIFACT — URL, screenshots, route, component, or document}}

PURPOSE CLAIM:
{{PURPOSE — what the design is trying to make possible, one sentence}}

AUDIENCE AND CONTEXT:
{{CONTEXT — who uses it, on what device, under what stress or constraint}}

GOVERNING RULES (if any):
{{RULES — contract, lab, or prior review to measure against}}

---

Review each of the eight dimensions:
  01 Purpose — what is the design trying to make possible?
  02 Clarity — is the primary action discoverable?
  03 Context — what constraints shape the experience?
  04 Inclusion — who has to work harder?
  05 System coherence — does this follow an existing system?
  06 Durability — will this hold up under repeated use?
  07 Delight — does emotion clarify or distract?
  08 Responsibility — what costs are hidden?

For each dimension:
  1. Observation — what is present or missing
  2. Judgment — consequence for the user or system
  3. Action — keep, fix, remove, or document as open tension

Then return the Output format defined by the kit:
  Summary, Outcome (pass / pass with notes / needs revision / blocked),
  Dimension findings (all eight), Holds, Tensions, Corrections,
  Verification performed, Sources used.`,
  output_format: [
    {
      title: 'Summary',
      meta: 'One paragraph: what holds, what fails, overall readiness',
    },
    {
      title: 'Outcome',
      meta: 'pass · pass with notes · needs revision · blocked · archive',
    },
    {
      title: 'Dimension findings',
      meta: 'All eight dimensions with observation, judgment, action',
    },
    {
      title: 'Holds',
      meta: 'Decisions and behaviors that should remain',
    },
    {
      title: 'Tensions',
      meta: 'Named open problems — not hidden taste notes',
    },
    {
      title: 'Corrections',
      meta: 'Concrete next edits, ordered by consequence',
    },
    {
      title: 'Verification performed',
      meta: 'What was checked: keyboard, mobile, reduced motion, tokens, states',
    },
    {
      title: 'Sources used',
      meta: 'Contract, lab, field check, or doctrine paths consulted',
    },
  ],
  verification: [
    'Separate observed behavior from derived judgment',
    'Name tradeoffs explicitly',
    'Identify hidden burdens on users or maintainers',
    'Check missing states: empty, error, loading, disabled, success',
    'Verify accessibility, keyboard path, and reduced-motion behavior when UI is in scope',
    'Check responsiveness, persistence, performance, and provenance when relevant',
    'Recommend concrete corrections, not vague polish language',
    'Cite a governing contract token or name an open tension before claiming done',
    'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
    'Primary action button text passes WCAG AA 4.5:1 contrast against its fill',
  ],
  rationalizations: [
    {
      excuse: 'It looks fine to me',
      reality: 'Looking is not reviewing. Run all eight dimensions. A glance misses missing states, keyboard gaps, and hidden burdens.',
    },
    {
      excuse: 'The CSS matches the contract',
      reality: 'Token matching is one verification item, not the whole review. Layout, interaction, inclusion, and delight still need dimension passes.',
    },
    {
      excuse: 'It is just a small change',
      reality: 'Small changes still push files past healthy sizes, add untested states, or break responsive behavior. Judge the resulting structure, not the diff size.',
    },
    {
      excuse: 'Accessibility can be added later',
      reality: 'Retrofitting accessibility is 3x harder than building it from the start. Review it now, document gaps, and name them as tensions if they cannot be fixed today.',
    },
    {
      excuse: 'It works on my machine',
      reality: 'Manual testing does not persist. Check mobile (375px), tablet (720px), desktop (1080px+), keyboard, and reduced motion. Tomorrow\'s change might break what you did not verify.',
    },
    {
      excuse: 'The design is not final, so I will skip styling review',
      reality: 'Use the contract defaults. Unstyled or half-styled UI creates a broken first impression. Review against the system even when the design is provisional.',
    },
    {
      excuse: 'AI generated it, so it is probably fine',
      reality: 'AI output needs more scrutiny, not less. It is confident and plausible even when wrong. Run every dimension.',
    },
  ],
  anti_patterns: [
    'Subjective taste with no consequence',
    'Approving screenshots without comparison to a rule or purpose',
    'Ignoring mobile, keyboard, or reduced motion',
    'Skipping empty, error, or loading states',
    'Adding decoration to hide weak hierarchy',
    'Accepting generic SaaS output because it “works”',
    'Letting one-off choices become hidden doctrine',
    'Claiming finality when identity, tokens, or deployment are still provisional',
  ],
  quality_bar:
    'Functional is the baseline. Considered is the bar. An artifact is ready when every dimension has been checked, tradeoffs are named, and remaining tensions are documented — not hidden.',
} as const;

export type DesignReviewKit = typeof designReviewKit;
