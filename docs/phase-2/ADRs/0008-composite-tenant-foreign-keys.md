# ADR 0008: Composite tenant-aware foreign keys

- Status: Accepted
- Date: 2026-07-12

## Decision

For customer-owned parent/child records, foreign keys include tenant identity, for example:

```sql
foreign key (tenant_id, object_id)
references stored_objects (tenant_id, id)
```

## Why

A conventional foreign key proves only that an object exists. It does not prove that the child and parent belong to the same customer. RLS controls reads, but malformed cross-tenant relationships can still be created by privileged code and later leak through jobs, caches, exports, or model context.

## Consequences

- Tenant identity is intentionally repeated in child tables.
- Repository methods must always pass tenant ID.
- Some queries use wider indexes, accepted as a security cost.
- Cross-tenant references fail at the database boundary even under service-role code.
