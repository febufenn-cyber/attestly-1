# ADR 0015: OOXML minimal-edit export with package diffing

- Status: Accepted
- Date: 2026-07-12

## Decision

Questionnaire export always operates on a copy of the immutable original, writes only compiled destinations, reopens the result, and compares OOXML package-part hashes.

A workbook opening successfully is necessary but insufficient. Changes outside permitted worksheet, shared-string, style or benign metadata parts block validation.

## Why

High-level workbook libraries can silently rewrite unsupported OOXML features. Package-level comparison exposes unrelated changes that cell-level tests miss.

## Consequences

- Complex workbooks may fall back to manual completion.
- Export compatibility is intentionally narrower than import compatibility.
- Future parser/library changes must pass the same round-trip corpus.
