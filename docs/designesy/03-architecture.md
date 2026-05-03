# Designesy Operational Architecture

## 1. Architecture Purpose
This architecture defines how Designesy converts sourced doctrine into governed, deployable design outputs. It establishes system layers, transformation flow, public/private boundaries, and agent workflow so work remains intentional, traceable, and extensible.

## 2. Core Layers

### Core
Mission, stance, and governing doctrine that define why the system exists and what it must optimize for.

### Graph
Structured relationship layer connecting sources, observations, claims, principles, contracts, and produced artifacts.

### Contracts
Explicit rules that convert principles into reusable constraints for decisions, tokens, components, behaviors, and review criteria.

### Labs
Controlled experimental environment for testing contract-driven ideas and prototypes before promotion into durable system assets.

### Review
Evaluation layer that validates provenance, contract compliance, quality, and readiness before merge and release.

### Agent Kits
Operational packages for human and software agents: instructions, workflows, reusable patterns, and safe execution boundaries.

### Logs
Trace layer recording decisions, changes, verification outcomes, and system evolution for governance and continuity.

## 3. Transformation Pipeline
`Source -> Observation -> Claim -> Tension -> Principle -> Pattern -> Contract Rule -> Token / Component / Behavior -> Verification Artifact -> Shipped Work`

Each step must preserve provenance and make derivation explicit. Work that skips steps may explore in private, but does not ship from this public repository.

## 4. Public Repository Role
This repository is the controlled public root for deployable, public-ready Designesy outputs. It contains governed doctrine, contracts, documentation, and future product surfaces that are safe to expose and extend.

## 5. Private/Internal Boundary
Private archives, unstable experiments, raw internal doctrine, personal files, secrets, billing, and registrar control remain outside this repository. Only curated, public-ready artifacts cross into this boundary.

## 6. Deployment Direction

- **GitHub as source-of-truth:** canonical collaboration, history, review, and merge layer.
- **Vercel as likely deployment layer:** expected runtime and delivery platform for public surfaces.
- **Unstoppable Domains as canonical domain/DNS identity layer:** external naming and identity anchor for public presence.

## 7. Agent Workflow

1. one task
2. one branch
3. one PR
4. review
5. merge
6. pull local

This sequence enforces atomic changes, clear accountability, and synchronization between local and remote state.

## 8. Future Surfaces
- designesy.org
- /labs
- /contracts
- /review
- /graph
- /docs
- /agent-kits

These surfaces are planned architecture targets and should be built as contract-governed system interfaces, not content placeholders.

## 9. Architecture Rules
- structure before UI
- contracts before styling
- public-ready only
- no secrets or raw private doctrine
- verify before shipping

These rules are mandatory for all artifacts intended to merge into the public Designesy system.
