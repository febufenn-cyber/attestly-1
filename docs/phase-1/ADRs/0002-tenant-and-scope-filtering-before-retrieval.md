# ADR 0002: Tenant, authorization, and scope filtering before retrieval

- Status: Accepted
- Date: 2026-07-12

## Context

Attestly will store highly sensitive evidence from multiple customers. Semantic similarity can cause a globally searched vector index to surface another tenant's content or evidence from the wrong product, environment, region, or time period. Filtering after retrieval is too late because unauthorized content may already have entered application memory, logs, caches, or model context.

## Decision

- Every customer-owned object, job, cache key, index record, generation run, and export includes immutable tenant identity.
- Authorization and tenant filters are applied before keyword/vector ranking and before content is returned to orchestration code.
- Scope compatibility, validity, confidentiality, disclosure permission, and evidence status participate in retrieval eligibility and ranking.
- Database RLS and application authorization both enforce isolation.
- No global retrieval followed only by application-side tenant filtering is permitted.
- Automated negative isolation tests are required for all tenant-bearing tables, endpoints, storage paths, caches, and retrieval systems.

## Consequences

### Positive

- Prevents the most catastrophic product failure.
- Makes security assumptions testable.
- Improves factual accuracy by preventing wrong-scope evidence reuse.

### Negative

- Retrieval architecture and indexes become more complex.
- Some optimizations require tenant-aware design.
- Scope metadata quality becomes a prerequisite for high-confidence answers.

## Rejected alternatives

### Global vector search with post-filtering

Rejected because unauthorized content can leak before the filter and because top results may crowd out correct tenant evidence.

### Client-side tenant filtering

Rejected because clients are untrusted and can alter identifiers or requests.

### One shared answer library without strict scope

Rejected because it becomes a stale and cross-product claim propagation mechanism.
