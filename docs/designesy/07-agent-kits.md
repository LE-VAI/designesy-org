# Designesy Agent Kits Doctrine

## 1. Agent Kit Purpose
Agent Kits are reusable instruction packages that bundle context, contracts, prompts, rules, verification steps, and boundaries so agents can produce coherent Designesy work without relearning the system each session.

## 2. What Agent Kits Contain
Every Agent Kit may include:
- purpose
- target agent or tool
- required context files
- relevant contracts
- allowed actions
- forbidden actions
- task prompt template
- verification checklist
- expected output format
- rollback or review notes

## 3. Planned Agent Kit Types
- Codex Site Kit
- Codex Docs Kit
- Codex Contract Kit
- OpenCode Kit
- Figma MCP Kit
- Image-to-Code Kit
- Design Review Kit
- Deployment Review Kit

## 4. Permission Levels
Define permission levels before task execution:
- read-only
- docs edit
- contract edit
- app edit
- visual/system edit
- deployment-sensitive
- infrastructure-protected

## 5. Agent Workflow
Use this default workflow:
read context -> identify kit -> create branch -> edit scoped files -> verify -> report -> PR -> review -> merge -> pull local

## 6. Required Boundaries
Agents must not:
- edit DNS, billing, secrets, registrar settings, or production deployment settings without explicit human instruction
- expose private/internal doctrine
- treat provisional identity as final canon
- bypass PR flow
- create generic AI SaaS output

## 7. Verification Requirements
Every agent task should report:
- files changed
- scope
- sources used
- verification performed
- risks or unresolved questions
- recommended next step

## 8. First Kit Candidates
- Codex Documentation Kit
- Codex Site Scaffold Kit
- Codex Contract Expansion Kit
- Designesy Review Kit
- Vercel Deployment Kit
