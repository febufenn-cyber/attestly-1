# Phase 2 — Secure Product Foundation

## Status

Implemented as a secure vertical slice. It is not yet approved for real customer data.

Phase 2 translates the Phase 1 constitution into executable boundaries:

- React/Vite web application;
- Cloudflare Workers + Hono API;
- Cloudflare Queue consumer and scheduled outbox dispatcher;
- Supabase Auth, Postgres, RLS, Storage, migrations, and pgTAP tests;
- shared TypeScript contracts for roles, permissions, jobs, API inputs, queue messages, and audit redaction;
- local, staging, and production configuration separation;
- CI and protected manual staging deployment.

## Demonstrated vertical slice

1. A user requests a Supabase email OTP/magic link.
2. The authenticated user creates or joins a workspace.
3. Roles belong to workspace memberships, not globally to users.
4. An administrator creates a one-time, email-bound, hashed invitation.
5. A permitted member requests an immutable upload identity.
6. The browser uploads directly to a private Supabase Storage path using a short-lived signed token.
7. Upload completion atomically changes database state and creates a job plus queue outbox entry.
8. The API attempts immediate queue dispatch; a scheduled worker recovers any undispatched outbox records.
9. The worker leases the job and re-checks tenant/object identity.
10. The worker downloads the exact tenant-owned object, validates size and file signature, computes SHA-256, and accepts or rejects it.
11. Users see object and job states; administrators and auditors see append-only audit events.
12. Cross-tenant reads and relationships are blocked by RLS and composite tenant-aware foreign keys.

## Repository map

```text
apps/
  api/       Hono request boundary, authentication, authorization, uploads, jobs, audit
  worker/    queue consumer, validation, hashing, retry/terminal failure handling, outbox recovery
  web/       authentication, workspaces, invitations, uploads, lifecycle dashboard
packages/
  foundation/ shared Zod schemas, permissions, state transitions, audit redaction
supabase/
  migrations/ database schema, RLS, storage policy, secure RPCs
  tests/      pgTAP two-tenant negative isolation suite
.github/workflows/
  ci.yml
  deploy-staging.yml
```

## Security invariants

1. Every customer-owned database row carries immutable `tenant_id`.
2. Child-to-parent customer relationships use `(tenant_id, id)` composite foreign keys where applicable.
3. RLS and application authorization are both required.
4. Browser-supplied workspace IDs are requests, never proof of membership.
5. Service-role access is server-only and always uses explicit tenant conditions.
6. Original storage paths and owners cannot be changed after creation.
7. The browser cannot choose its own bucket path.
8. A storage upload is allowed only when a matching pending database intent exists for the same user and tenant.
9. Uploaded bytes remain untrusted until signature, size, and hash validation succeeds.
10. Job creation and outbox creation occur in the same database transaction.
11. Queue processing is idempotent and lease-bound.
12. Audit events are append-only and metadata is redacted before insertion.
13. Preview/staging/production credentials are separate; project-reference mismatch fails closed.
14. No AI provider or evidence extraction is introduced before these boundaries exist.

## Local setup

Prerequisites:

- Node.js 22+
- Docker-compatible runtime
- Supabase CLI through project dependencies

```bash
cp .env.example .env
npm install
npm run supabase:start
npm run supabase:reset
npm run db:test
npm run dev:api
npm run dev:worker
npm run dev:web
```

Use the local keys printed by `supabase status`. Put Worker-only secrets in:

- `apps/api/.dev.vars`
- `apps/worker/.dev.vars`

Never prefix service-role values with `VITE_`.

## Staging prerequisites

Create these Cloudflare queues before the first deployment:

- `attestly-object-jobs-staging`
- `attestly-object-jobs-dead-staging`

Configure the GitHub `staging` environment with:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- variable `API_URL`

The deployment is manual and environment-protected. Production deployment is intentionally not automated in Phase 2.

## Verification

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
npm run db:test
```

The database suite uses two tenants with confusingly similar object names and attempts cross-tenant reads, references, uploads, invitations, audit mutation, and last-admin removal.

## Deliberate limits

- No real document extraction or embeddings yet.
- No AI answer generation yet.
- No questionnaire import/export yet.
- No billing.
- Invitation delivery is not connected to an email provider; the one-time URL is shown to the administrator for controlled testing.
- Office files are validated as ZIP-based containers; deep OOXML package validation belongs to Phase 3 ingestion.
- Malware scanning must be added before external beta.
- Production region, retention, subprocessors, and model-provider contracts remain external approval gates.

## Phase 3 handoff

Phase 3 may build evidence ingestion only on accepted immutable objects. It should add isolated PDF/DOCX/XLSX/TXT extraction, provenance spans, versioning, scope metadata, evidence approval, keyword/vector indexing, retrieval filters, and extraction-quality evaluation without weakening any Phase 2 invariant.
