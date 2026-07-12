# ADR 0017: Compile export plans before document writes

- Status: Accepted
- Date: 2026-07-12

## Decision

The exporter never interprets questionnaire questions or answer state directly. A final approver creates and validates a deterministic export plan containing exact destinations, outward values, expected formula/style/validation state and conditional activation.

Only validated plans may create export jobs.

## Why

Separating planning from execution makes every intended change reviewable and prevents an exporter from improvising cell placement or answer formatting during a write.

## Consequences

- Phase 5 and Phase 6 provide frozen answer snapshots, not document mutations.
- Unknown conditions, missing answers, formulas and protected destinations become plan blockers.
- The plan and output diff provide independent pre-write and post-write controls.
