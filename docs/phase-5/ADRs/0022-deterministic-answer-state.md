# ADR 0022: Deterministic answer state and citation validation

- Status: Accepted
- Date: 2026-07-13

## Decision

The model returns a schema-constrained draft for every atomic claim. Deterministic platform code validates claim coverage, citation identity, exact citation quotes, scope, evidence age, contradiction flags, disclosure permissions, answer-format constraints, and unsupported affirmative responses.

The platform derives the canonical answer state after validation. The model may not directly set that state.

## Rationale

A fluent model can omit unsupported clauses, fabricate citation IDs, broaden qualifiers, or choose a confident state inconsistent with the available evidence. Those are correctness and liability failures, not stylistic defects. The durable product boundary must therefore remain outside model prompts.

## Consequences

- Model providers remain replaceable.
- Invalid output fails closed without an outward answer.
- Every material claim remains visible even when unsupported.
- Confidence is reproducible and state-capped.
- Evaluation can separate model quality from deterministic safety.
- Phase 6 receives immutable drafts with explicit validation results rather than opaque prose.
