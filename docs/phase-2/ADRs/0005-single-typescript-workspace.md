# ADR 0005: Single TypeScript workspace with separate deployable applications

- Status: Accepted
- Date: 2026-07-12

## Decision

Use one root TypeScript dependency graph with three deployment boundaries:

- `apps/web` for the browser application;
- `apps/api` for the Hono HTTP Worker;
- `apps/worker` for queue and scheduled processing.

Shared contracts live in `packages/foundation` and contain no provider credentials or browser-specific state.

## Why

Phase 2 needs one definition of roles, permissions, job states, queue messages, API inputs, and audit redaction while preserving independent scaling and privilege boundaries. Separate repositories or duplicated package manifests would add drift before the product loop exists.

## Consequences

- One install and one CI contract.
- Web code never imports service-role helpers.
- API and queue worker deploy separately.
- The workspace may be split later if organizational or deployment needs justify it.
