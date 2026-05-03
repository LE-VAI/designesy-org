# Designesy Deployment Model

## 1. Purpose
Define an operational path that moves Designesy from governed source files to the public site without drift, hidden changes, or deployment chaos.

## 2. Layer Model
- **Unstoppable Domains**: canonical identity and DNS registrar layer.
- **GitHub**: source-of-truth collaboration and history layer.
- **Codex/future agents**: branch and pull-request contributors.
- **Vercel**: likely production deployment layer.
- **`main` branch**: production truth after reviewed merges.

## 3. Workflow
`agent prompt -> branch -> commit -> PR -> review -> merge -> pull local -> deployment`

## 4. Agent Permissions
Agents may propose and edit files through branches and pull requests.

Agents may not modify DNS, billing, secrets, registrar settings, environment variables, or production deployment settings without explicit human instruction.

## 5. Deployment Gates
- **Docs/content changes**: PR review, then merge.
- **Visual/site changes**: PR plus preview required before merge.
- **Identity/token changes**: contract update required before merge.
- **Infrastructure changes**: explicit human approval required.
- **DNS/domain changes**: human-only until later phases.

## 6. Planned Hosting Direction
Initial recommendation:

`GitHub private repo -> Vercel project -> designesy.org custom domain`

## 7. Subdomain / Route Strategy
Start as routes:
- `/labs`
- `/contracts`
- `/review`
- `/graph`
- `/docs`
- `/agent-kits`

Potential future subdomains (future, not immediate):
- `labs.designesy.org`
- `contracts.designesy.org`
- `graph.designesy.org`
- `review.designesy.org`
- `docs.designesy.org`
- `api.designesy.org`
- `studio.designesy.org`

## 8. Safety Rules
- Code changes deploy through Git, not manual site editing.
- DNS remains protected.
- Secrets never enter the repository.
- Internal doctrine is curated before becoming public.
- `main` should remain deployable.
