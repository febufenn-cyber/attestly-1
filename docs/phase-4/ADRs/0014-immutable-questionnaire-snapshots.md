# ADR 0014: Immutable questionnaire snapshots

- Status: Accepted
- Date: 2026-07-12

## Decision

Separate the immutable source artifact, import run, mapping version and frozen questionnaire snapshot. Phase 5 may consume only a frozen snapshot identified by a deterministic hash.

A mapping correction creates a new mapping version. Once frozen, source hash, question order, destinations, conditions, scope and decomposition cannot be changed in place.

## Why

Answers, approvals and exports need a stable interpretation of what the customer asked. Mutating mappings after generation would make answer provenance and cell placement impossible to audit.

## Consequences

- Historical mappings and snapshots remain available.
- Material corrections invalidate downstream work and create a new snapshot.
- Snapshot storage is more verbose, accepted as an audit and safety requirement.
