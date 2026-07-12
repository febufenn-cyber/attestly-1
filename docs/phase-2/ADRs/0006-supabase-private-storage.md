# ADR 0006: Supabase private storage for Phase 2 originals

- Status: Accepted
- Date: 2026-07-12

## Decision

Store original evidence in a private Supabase Storage bucket. Object identity is created in Postgres first, then uploaded through a short-lived signed upload token to a server-generated path.

## Why

This keeps Auth, RLS metadata, object policies, and storage lifecycle in one security domain during the foundation phase. A storage object is usable only when a matching tenant-owned database intent exists.

## Rejected

- Public buckets.
- User-selected paths.
- Proxying all bytes through the API Worker.
- Adding R2 before a demonstrated requirement.

## Consequences

Storage may move behind an abstraction later. The database object identity and hash remain the canonical record, so migration does not change product truth.
