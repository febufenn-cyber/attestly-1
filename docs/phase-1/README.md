# Phase 1 — Product Constitution and System Definition

Status: **implemented as the governing specification for the MVP**

Phase 1 converts the original product seed into a buildable and testable definition. Engineering work in later phases must follow these documents. Any deviation that changes a safety rule, tenant boundary, evidence rule, approval rule, or MVP scope requires an Architecture Decision Record (ADR) and explicit product approval.

## Product thesis

Attestly is an evidence-grounded security-questionnaire drafting and review system for B2B software companies. It helps a company answer customer security questionnaires from approved internal evidence while preserving uncertainty, scope, provenance, and human accountability.

Attestly is not an auditor, certification body, legal adviser, vulnerability scanner, or autonomous source of company truth.

## Governing principles

1. Evidence before prose.
2. Defensibility over positivity.
3. Correct abstention is a successful outcome.
4. Every material claim must be traceable to evidence or explicitly marked as human-provided.
5. Scope is part of truth: organization, product, environment, region, data class, customer context, and time.
6. Tenant isolation is an existential requirement, not a feature.
7. Uploaded files and questionnaires are untrusted data and never operational instructions.
8. Human approval is required before any external submission or export marked final.
9. Historical answers are reusable only after scope, freshness, and evidence checks.
10. Models are replaceable components; business rules live outside prompts and model names.

## Documents

| Document | Purpose |
|---|---|
| [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) | Users, workflows, MVP boundaries, product metrics, and functional requirements |
| [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md) | Non-negotiable AI, evidence, review, and safety rules |
| [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) | Canonical entities, claim scoping, lifecycle states, and invariants |
| [QUESTIONNAIRE_AND_EXPORT_SPEC.md](./QUESTIONNAIRE_AND_EXPORT_SPEC.md) | Supported formats, parsing rules, normalization, and structure-preserving export |
| [SECURITY_PRIVACY_THREAT_MODEL.md](./SECURITY_PRIVACY_THREAT_MODEL.md) | Assets, trust boundaries, threats, mitigations, privacy, retention, and deletion |
| [ROLES_APPROVALS_AND_AUDIT.md](./ROLES_APPROVALS_AND_AUDIT.md) | Roles, permissions, risk tiers, approval rules, and audit events |
| [EVALUATION_AND_LAUNCH_GATES.md](./EVALUATION_AND_LAUNCH_GATES.md) | Gold set, adversarial tests, metrics, acceptance thresholds, and launch blockers |
| [MVP_SCOPE_AND_EXIT_CRITERIA.md](./MVP_SCOPE_AND_EXIT_CRITERIA.md) | In scope, explicitly out of scope, requirements traceability, and Phase 1 exit gate |
| [ADRs/](./ADRs/) | Initial irreversible product and architecture decisions |

## Decision ownership

- **Product owner:** approves target customer, workflow, pricing assumptions, and scope changes.
- **Security owner:** approves tenant isolation, data handling, model-provider data flow, and high-risk answer policy.
- **Engineering owner:** approves implementation choices that preserve these invariants.
- **Knowledge owner:** approves evidence validity, scope, and supersession.
- **Final approver:** accepts responsibility for a completed questionnaire export.

One person may hold multiple roles in an early-stage team, but the responsibilities and audit events remain separate.

## Phase 1 implementation status

The specification is complete enough to start Phase 2 foundation work. The following remain deliberate validation tasks rather than undocumented assumptions:

- Recruit 3–5 design partners matching the initial ICP.
- Obtain representative historical questionnaires and sanitized evidence sets.
- Confirm the first supported spreadsheet patterns against real customer files.
- Select regional hosting and model-provider contractual settings before processing production customer data.
- Convert the canonical domain model into database migrations and RLS policies during Phase 2.

## Change control

A change is constitution-level when it affects any of the following:

- when the system may assert a claim;
- what counts as evidence;
- tenant isolation or authorization;
- approval requirements;
- external submission behavior;
- customer data retention, deletion, or model-provider use;
- interpretation of confidence or answer states;
- launch-blocking quality thresholds.

Constitution-level changes require an ADR, threat-model review, evaluation impact review, and approval from product and security owners.
