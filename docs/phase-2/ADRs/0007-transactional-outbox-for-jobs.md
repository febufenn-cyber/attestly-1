# ADR 0007: Transactional outbox before Cloudflare Queue dispatch

- Status: Accepted
- Date: 2026-07-12

## Decision

Upload completion creates the job and queue-outbox row in one Postgres transaction. The API attempts immediate dispatch. A scheduled Worker retries undispatched outbox entries.

## Why

Directly updating the database and then publishing a queue message creates two failure windows: committed work without a message, or a message for rolled-back work. The outbox makes recovery observable and idempotent.

## Consequences

- Queue delivery can be duplicated, so consumers lease jobs and remain idempotent.
- Outbox rows are tenant-owned but inaccessible to normal users.
- Dispatch failures are retained without exposing sensitive payloads in logs.
