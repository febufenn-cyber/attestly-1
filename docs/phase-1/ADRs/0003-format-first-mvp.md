# ADR 0003: Format-first MVP with XLSX and CSV as primary questionnaire paths

- Status: Accepted
- Date: 2026-07-12

## Context

Questionnaires arrive in many formats, but reliable answer placement and preservation of customer structure are more valuable than shallow support for every format. Complex PDFs, macro-driven workbooks, and web portals introduce independent extraction, execution, credential, and irreversible-submission risks.

## Decision

- XLSX and CSV are the primary MVP questionnaire formats.
- Clean DOCX is supported only after compatibility validation.
- PDF support is import/manual-review oriented until extraction and mapping meet launch gates.
- Macros, scripts, external links, and embedded active content are never executed.
- The product produces a compatibility report before generation/export.
- Automatic final export is available only when mapping and structural fidelity can be validated.
- Unsupported artifacts receive an approved answer-table/manual completion fallback rather than a false “completed export” status.

## Consequences

### Positive

- Focuses engineering on the most common and testable workflow.
- Makes round-trip export correctness measurable.
- Avoids brittle browser automation and macro execution.
- Creates an honest failure mode for unsupported files.

### Negative

- Some prospective customers will need manual fallback.
- Format coverage expands more slowly.
- A representative workbook corpus is required.

## Rejected alternatives

### Support every document format at launch

Rejected because broad nominal support would mask low mapping and export reliability.

### Portal automation first

Rejected because it requires credentials, MFA handling, fragile selectors, and direct external submission before the answer engine is proven.

### Flatten all questionnaires into CSV

Rejected because sections, conditional logic, instructions, formatting, and evidence requests can be lost.
