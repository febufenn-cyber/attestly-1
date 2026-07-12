# ADR 0010: One canonical document representation

- Status: Accepted
- Date: 2026-07-12

## Decision

All format adapters emit versioned `DocumentNode` and `ExtractionManifest` schemas before evidence spans are constructed.

Nodes preserve semantic type, parent, display order, exact text, normalized text, page/sheet/cell coordinates, heading path, extraction method, confidence, flags, and format-specific metadata.

## Why

Parser-specific database schemas would make citation, review, retrieval, reprocessing, and evaluation inconsistent. A common representation allows deterministic validation while retaining format-specific metadata.

## Consequences

- Adapter upgrades require a manifest/extractor version.
- Historical spans are not mutated when a parser changes.
- Unsupported visual structures remain explicit warnings rather than fabricated text.
