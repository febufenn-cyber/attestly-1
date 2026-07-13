# ADR 0023: Immutable generation ledger

- Status: Accepted
- Date: 2026-07-13

## Decision

Every answer-generation attempt is represented by a tenant-owned immutable ledger:

1. a generation run bound to one frozen questionnaire snapshot and one question;
2. an immutable generation-input hash and structured input snapshot;
3. an immutable ordered candidate set referencing exact evidence spans;
4. an append-only answer revision;
5. append-only atomic claim outcomes and exact citations.

Authenticated users may request generation through a security-definer function, but only service-role runtime code may persist model inputs, candidates, results, failures, claims, or citations. No generation table grants a path to questionnaire export tables.

## Rationale

Model output is not reproducible unless the exact questionnaire snapshot, evidence candidate set, provider identity, prompt version and deterministic validation result are retained. Mutable prose or mutable citations would make later review, incident investigation and approval invalidation unreliable.

## Consequences

- Cross-tenant candidate and citation references fail at database constraints.
- A citation must have appeared in the immutable candidate set for that run.
- Invalid model output is retained only as a blocked revision with no outward answer.
- Human changes belong to Phase 6 revisions; model-generated revisions remain unchanged.
- Audit events contain identifiers and states, not source documents or model prompts.
