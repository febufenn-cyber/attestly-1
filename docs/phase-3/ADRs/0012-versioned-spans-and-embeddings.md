# ADR 0012: Immutable spans and versioned embeddings

- Status: Accepted
- Date: 2026-07-12

## Decision

Evidence spans are immutable outputs of one extraction run and are bound to source node IDs plus a content hash. Reprocessing creates a new run and new spans. Embeddings are optional records keyed by tenant, span, provider, model, dimensions, ruleset version, and source hash.

## Why

Overwriting chunks or vectors would break approved citations and make historical answers unreproducible. Provider-neutral versioning keeps the durable product independent from one embedding service.

## Consequences

- No embedding provider is enabled by default.
- Lexical retrieval remains a first-class search mode.
- Reindexing marks old indexes stale instead of rewriting evidence history.
