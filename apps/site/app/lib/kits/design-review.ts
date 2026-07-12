/**
 * Use Kit One · Design Review
 * Portable instruction package for humans and agents.
 * Source: public Review doctrine + design system contract v0.1.
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
  handoff_line:
    'Tell your agent to review with Designesy — designesy.org/kits/design-review',
  permission: 'read-only by default · report only unless edit scope is explicit',
  related: [
    {
      href: '/review',
      title: 'Review surface',
      meta: 'Eight dimensions and field checks',
    },
    {
      href: '/contracts/design-system',
      title: 'Design system contract v0.1.1',
      meta: 'Human home and machine export · Poise adopted',
    },
    {
      href: '/review/poise',
      title: 'Field check · Poise',
      meta: 'Kit One applied to Lab One · pass with notes',
    },
    {
      href: '/review/designesy-org',
      title: 'Field check · designesy.org',
      meta: 'Public surface review against contract v0.1.1',
    },
    {
      href: '/labs/poise',
      title: 'Lab One · Poise',
      meta: 'Interaction behaviors under review for adoption',
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
Optional contract: https://www.designesy.org/contracts/design-system
Optional machine rules: https://www.designesy.org/contracts/design-system.json

Review the artifact below. Lead with consequences, not personal taste.
Separate observed behavior from derived judgment.
Name tradeoffs. Identify hidden burdens. Check missing states.
Verify accessibility, keyboard flow, responsiveness, persistence, performance, and provenance when relevant.
Recommend concrete corrections.

Artifact:
{{ARTIFACT}}

Purpose claim:
{{PURPOSE}}

Audience and context:
{{CONTEXT}}

Governing rules (if any):
{{RULES}}

For each of the eight dimensions (Purpose, Clarity, Context, Inclusion, System coherence, Durability, Delight, Responsibility):
1. Observation — what is present or missing
2. Judgment — consequence for the user or system
3. Action — keep, fix, remove, or document as open tension

Then return the Output format defined by the kit.`,
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
