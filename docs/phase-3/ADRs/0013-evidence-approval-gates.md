# ADR 0013: Knowledge-owner evidence approval with hard technical gates

- Status: Accepted
- Date: 2026-07-12

## Decision

Only a workspace knowledge owner may approve an evidence version. Approval requires successful extraction, minimum quality, clean malware status, effective and review dates, and no unresolved critical extraction warning.

## Why

Uploading or parsing a document does not establish its authority, scope, currency, or disclosure status. Workspace administration alone does not confer authority to approve technical evidence.

## Consequences

- Clean high-quality extraction enters `ready_for_review`, not `approved`.
- Evidence approval remains distinct from answer or questionnaire approval.
- Development-mode unscanned extraction can be inspected but cannot be approved.
