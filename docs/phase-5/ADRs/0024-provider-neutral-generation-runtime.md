# ADR 0024: Provider-neutral generation runtime

- Status: Accepted
- Date: 2026-07-14

## Decision

Run answer generation in a dedicated Cloudflare Queue consumer behind a provider-neutral interface. The worker retrieves only tenant- and requester-eligible evidence, persists the exact structured input and ordered candidate set before calling a model, validates the provider response deterministically, and persists an immutable revision through service-only database functions.

The runtime ships with:

- a deterministic fake provider for tests and local development;
- an Anthropic Messages adapter as the initial production adapter;
- no model tools or document-controlled actions;
- operation-specific minimal-context prompts;
- explicit timeout, rate-limit, retry, terminal-failure, cancellation, and dead-letter handling;
- token, latency, and estimated-cost metadata without prompt or evidence logging.

## Rationale

Provider output is untrusted. Tenant authorization, evidence eligibility, scope, disclosure, answer state, citations, confidence, and outward answer constraints must remain deterministic application rules. Persisting the input before invocation makes retries and later investigations reproducible.

## Consequences

- Model providers cannot query databases, widen scope, choose tools, approve answers, or export artifacts.
- A service-only retrieval function evaluates the original requester's current membership and restricted-evidence role before ranking.
- Retries must reuse the same input hash and candidate snapshot.
- Malformed or non-retryable provider output produces a blocked revision with no outward value.
- Production cannot use the deterministic fake provider.
