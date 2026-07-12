# ADR 0001: Evidence-grounded drafting with mandatory human final approval

- Status: Accepted
- Date: 2026-07-12

## Context

Security-questionnaire answers are external representations that may affect contracts, customer trust, audits, and liability. Language models can produce plausible answers without customer-specific proof. A fully autonomous completion promise would create pressure to hide uncertainty and overstate controls.

## Decision

Attestly is an evidence-grounded drafting and review system.

- Evidence retrieval and validation occur before answer generation.
- Every material supported claim maps to exact evidence spans.
- Unsupported, stale, contradictory, ambiguous, or out-of-scope claims receive explanatory answer states.
- A human approves an immutable questionnaire snapshot before final export.
- The MVP does not submit answers directly to external portals or customers.

## Consequences

### Positive

- Reduces hallucinated company claims.
- Creates clear provenance and accountability.
- Makes correct abstention valuable.
- Supports auditable review and safer institutional memory.

### Negative

- The workflow cannot honestly promise zero-touch completion.
- Review UX and approval infrastructure become core product work.
- Some customers seeking pure automation may not be a fit.

## Rejected alternatives

### Autonomous answer-and-submit

Rejected because wrong answers become irreversible external commitments and portal automation adds credential, terms, and mapping risk.

### Generic chat over policy documents

Rejected because chat does not enforce claim-level provenance, scope, approvals, or structure-preserving export.

### Human review only for low-confidence model outputs

Rejected because model self-confidence is not a reliable safety boundary and high-impact errors may be fluent.
