# ADR 0018: Honest manual-completion fallback

- Status: Accepted
- Date: 2026-07-12

## Decision

When structure-preserving export cannot be guaranteed, Attestly produces a manual completion package containing approved answers, source identifiers, locations, conditions and copy instructions.

It must not label this artifact a completed questionnaire.

## Why

Unsupported macros, protected fields, unsafe DOCX regions or unexpected structural diffs make automatic completion unreliable. Attempting export anyway would convert uncertainty into silent document corruption.

## Consequences

- Import may succeed while export remains manual.
- Compatibility reports distinguish import, mapping and export capability.
- The product favors explicit limitation over a misleading completion status.
