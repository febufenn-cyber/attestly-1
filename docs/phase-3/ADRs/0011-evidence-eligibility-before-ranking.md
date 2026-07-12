# ADR 0011: Evidence eligibility before ranking

- Status: Accepted
- Date: 2026-07-12

## Decision

Retrieval first excludes candidates that fail tenant authorization, content permission, evidence approval, current/historical mode, index state, scope, effective period, or disclosure policy. Ranking runs only over the eligible corpus.

## Why

Post-filtering global search risks cross-tenant leakage, poor filtered recall, wrong-scope answers, and accidental external disclosure. Semantic similarity is not authority.

## Consequences

- A scope mismatch has a final rank of zero.
- External quote and summary operations use stricter eligibility rules.
- Restricted content has a separate authorization function.
- Retrieval runs and selected candidates are auditable.
