# ADR 0016: Explicit conditions and preserved polarity

- Status: Accepted
- Date: 2026-07-12

## Decision

Represent questionnaire conditions as machine-readable expression trees evaluated to `active`, `inactive` or `unknown`. Preserve the original textual instruction and human-confirmation status.

Store question polarity separately from normalized wording. Negative questions are never silently rewritten into positive form.

## Why

A binary condition model exports child answers prematurely when parent answers are unavailable. Silent polarity rewriting can invert security meaning—for example, a desirable answer to “Do you permit shared administrator accounts?” is normally “No.”

## Consequences

- Unknown activation blocks export.
- Inactive destinations remain blank unless an explicitly approved rule says otherwise.
- Condition graphs require missing-reference and cycle validation.
