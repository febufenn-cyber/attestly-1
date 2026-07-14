# Phase 5 Exit Review

- Review date: 2026-07-14
- Decision: Engineering complete for pre-beta integration
- Production-data approval: Not granted
- Next phase: Phase 6 — human review, approvals, controlled reuse, and approved export

## Exit criteria

| Criterion | Result |
| --- | --- |
| Frozen Phase 4 questions are the only generation source | Passed |
| Tenant and requester authorization occurs before retrieval ranking | Passed |
| Restricted evidence requires a current authorized role | Passed |
| Exact generation input and candidate set are immutable | Passed |
| One fake and one production provider adapter exist | Passed |
| Provider output is schema-constrained and deterministically validated | Passed |
| Supported material claims require exact eligible citations | Passed |
| Scope mismatch, historical-only support, contradictions, and missing evidence abstain safely | Passed |
| Malformed output produces no outward value | Passed |
| Retry, timeout, cancellation, rate-limit, terminal failure, and dead-letter behavior exist | Passed |
| Token, latency, and cost metadata exclude prompt/evidence content | Passed |
| Reviewer console exposes limitations and provenance | Passed |
| Regeneration creates a new immutable run | Passed |
| Phase 5 cannot approve or export answers | Passed |
| Versioned adversarial evaluation is a CI release gate | Passed |

## Critical deterministic evaluation gates

The `phase5-gold-v1` corpus covers:

- exact current operational proof;
- no eligible evidence;
- contradictory approved evidence;
- wrong-product or wrong-environment scope;
- historical-only support;
- a partially supported compound question;
- document prompt injection;
- a fabricated cross-tenant citation.

Required results:

- state accuracy: 100%;
- citation validity: 100%;
- scope accuracy: 100%;
- abstention precision: 100%;
- material supported-claim traceability: 100%;
- fabricated citations persisted: 0;
- unsafe prompt-injection compliance: 0;
- cross-tenant citations persisted: 0;
- blocked outward-value violations: 0.

The machine-readable report is generated in CI and retained as the `phase5-evaluation-report` artifact.

## Security proof

- The model receives only pre-filtered evidence candidates.
- The model has no tools, database credentials, tenant-selection authority, or export capability.
- Service retrieval evaluates the original requester’s current membership and restricted-evidence role.
- Cross-tenant candidate relationships fail at composite database boundaries.
- Citations outside the immutable candidate set cannot be persisted.
- Evidence content is explicitly treated as untrusted data.
- Input, candidates, revisions, claims, citations, and provider usage are immutable or append-only.
- Authenticated users cannot access generation queue-outbox records.
- The inspection console is read-only with respect to approval and export.

## Known limits and external blockers

- A real Anthropic staging smoke test requires a user-managed `ANTHROPIC_API_KEY`, an approved provider account, and configured staging infrastructure.
- Production region, retention, subprocessors, contractual model terms, and incident procedures still require Phase 7 approval.
- Drafts remain unapproved. Phase 6 must implement immutable human revisions, risk-based approval, approval invalidation, trusted reuse, and approved export integration.
- The Phase 5 corpus is an engineering gate, not a substitute for real design-partner questionnaires and evidence packages.

## Handoff rule

Phase 6 must consume immutable Phase 5 revisions and preserve their model, candidate, claim, citation, confidence, validation, and audit provenance. Human edits must create new revisions; they must never rewrite generated revisions in place.
