# Decision Log

| Date | Decision | Rationale | Source | Status |
|---|---|---|---|---|
| 2026-05-03 | Keep the private Designesy source workspace separate from the public Designesy repository. | Separates internal build surface from public governance surface while preserving controlled publication. | `docs/designesy/00-context-map.md` | active |
| 2026-05-03 | Use GitHub as source-of-truth. | Keeps version history, review trail, and collaboration centered in one canonical repository system. | `docs/designesy/00-context-map.md` | active |
| 2026-05-03 | Use PR flow for agent changes. | Enforces reviewable, auditable, and reversible updates for governance-sensitive artifacts. | `docs/designesy/00-context-map.md`, `AGENTS.md` | active |
| 2026-05-03 | Treat Vercel as likely deployment layer. | Aligns with documented deployment model assumptions for current public infrastructure direction. | `docs/designesy/00-context-map.md`, `docs/designesy/02-deployment-model.md` | provisional |
| 2026-05-03 | Treat Unstoppable Domains as canonical identity/DNS registrar layer. | Maintains a consistent identity and naming authority model across public surfaces. | `docs/designesy/00-context-map.md`, `docs/designesy/02-deployment-model.md` | provisional |
| 2026-05-03 | Keep Labs as future experiments that compile into contracts. | Preserves Labs as a structured experimentation layer that feeds governance artifacts rather than ungoverned output. | `DESIGN.md`, `AGENTS.md` | active |
