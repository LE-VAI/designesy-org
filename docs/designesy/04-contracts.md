# Designesy Contracts Doctrine

## 1. Contract Purpose
Contracts make design reasoning reusable, inspectable, governable, and portable across agents, tools, sessions, and codebases.

In Designesy, contracts convert principle-level intent into operational rules that can be executed, reviewed, and extended without losing provenance.

## 2. Contract Model
A Designesy contract must preserve this chain:

`source -> principle -> rule -> token/component/behavior -> verification`

Operational requirements:
- each rule must cite source basis and principle linkage
- each token/component/behavior mapping must be explicit
- each mapping must have a verification method before it is treated as system truth

## 3. Contract Types
- **Root contract:** `DESIGN.md`
- **Core contract:** future expanded Designesy Core contract
- **Lab contract:** rules extracted from experiments
- **Identity contract:** brand and visual system rules
- **Interface contract:** UI, layout, and component behavior rules
- **Review contract:** criteria for evaluating work
- **Agent contract:** operating rules for agent behavior

## 4. Minimum Contract Contents
Every contract must include:
- name
- version
- status
- scope
- source basis
- rationale
- rules
- anti-patterns
- verification requirements
- open questions

Contracts missing any required field are incomplete and should not be treated as authoritative governance.

## 5. Contract Statuses
- **provisional:** draft governance under active evaluation; usable with caution
- **active:** current governing contract for stated scope
- **deprecated:** no longer preferred for new work; retained for transition continuity
- **archived:** historical record only; not valid for current decisions
- **superseded:** explicitly replaced by a newer contract version

Status changes must be logged in registries and decision logs to preserve governance continuity.

## 6. Agent Rules
Agents must:
- read relevant contracts before creating artifacts
- avoid inventing style without source or rationale
- update contracts when repeated decisions become system rules
- never treat screenshots or vibes as sufficient governance
- preserve source provenance

If contract guidance conflicts across scopes, agents should follow the most specific applicable contract and record resolution rationale.

## 7. Anti-Patterns
- token dump without rationale
- prose-only manifesto with no rules
- copying an external system instead of deriving original rules
- treating Labs experiments as production rules too early
- allowing one-off styling to become hidden doctrine

Anti-pattern occurrences should trigger review and either contract correction or explicit exception logging.

## 8. Next Contract Candidates
- Designesy Core Contract v0
- Designesy Identity v0 Reference
- Designesy Labs Contract
- Designesy Review Contract
- Designesy Agent Kit Contract
