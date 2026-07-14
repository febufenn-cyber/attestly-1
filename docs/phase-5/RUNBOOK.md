# Phase 5 Operations Runbook

## Purpose

This runbook covers the evidence-grounded answer-generation API, queue worker, inspection console, deterministic evaluation, and safe failure handling. Phase 5 drafts are not approved customer representations.

## Services

- `attestly-answer-api-*` — authenticated generation and inspection API.
- `attestly-generation-worker-*` — Cloudflare Queue consumer and outbox recovery cron.
- `attestly-answer-console-*` — read-only draft inspection and regeneration workspace.
- Supabase Postgres — generation ledger, immutable candidates, revisions, citations, usage, RLS, and audit.
- Cloudflare Queues — generation jobs and dead-letter queue.
- Anthropic Messages API — initial staging and production model adapter.

## Required staging configuration

GitHub `staging` environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

GitHub `staging` environment variable:

- `ANSWER_API_URL`

Cloudflare queues:

- `attestly-generation-jobs-staging`
- `attestly-generation-jobs-dead-staging`

Production must use separate projects, queues, secrets, origins, provider credentials, and approval records.

## Pre-deployment gates

```bash
npm install
npm run format:check
npm run typecheck
npm run test
npm run eval:phase5
npm run build
npm audit --omit=dev --audit-level=high
npm run supabase:start
npm run supabase:reset
npm run db:test
npm run supabase:stop
```

The generated machine-readable report is written to:

```text
reports/phase5-evaluation-report.json
```

Deployment is blocked when any critical Phase 5 metric fails.

## Deployment

Use the protected manual workflow:

```text
.github/workflows/deploy-phase5-staging.yml
```

It applies reviewed migrations, configures secrets, deploys the answer API and generation worker, builds the answer console, and deploys the console assets.

## Staging smoke test

1. Sign in to the answer console with a staging user.
2. Select a workspace containing an approved evidence corpus and frozen questionnaire snapshot.
3. Generate one question with exact current evidence.
4. Confirm the run transitions through queued/retrieving/generating to succeeded.
5. Confirm the draft shows every atomic claim and exact citation location.
6. Generate a question with no eligible evidence and confirm there is no outward value.
7. Generate a contradictory fixture and confirm the contradiction is visible.
8. Confirm provider usage records token counts, latency, attempt, and estimated cost without prompt content.
9. Regenerate the same question and confirm a new immutable run and revision are created.
10. Confirm no Phase 5 UI or API can approve or export the draft.

A real Anthropic smoke test requires a user-managed staging API key and approved provider account. CI validates the adapter contract with deterministic HTTP fixtures but cannot fabricate those external credentials.

## Failure handling

### Provider rate limit or transient upstream error

- The worker records `failed_retryable`.
- Cloudflare Queue retries with bounded exponential delay.
- The immutable input hash and candidates must remain unchanged.
- After the maximum attempt count, the run becomes terminal or produces a blocked revision with no outward value.

### Malformed provider output

- Treat as non-retryable unless the failure is an upstream transport problem.
- Persist a `blocked_from_automation` revision.
- Store no outward value or outward text.
- Preserve the validation error code for reviewer inspection.

### Worker redelivery

- Terminal runs acknowledge immediately.
- Input persistence is idempotent only when the hash and snapshot match.
- Provider usage is unique by tenant, run, and attempt.
- Revisions, claims, citations, and usage records are append-only.

### Requester removed or loses restricted-content access

- Service retrieval re-evaluates the original requester’s current active membership and role.
- Retrieval fails closed before ranking.
- The model must not receive evidence the requester can no longer access.

### Suspected cross-tenant exposure

1. Disable the affected queue consumer.
2. Preserve relevant audit, retrieval, generation, and provider-request identifiers.
3. Revoke provider and service credentials if compromise is plausible.
4. Run tenant-isolation and Phase 5 evaluation suites.
5. Follow the incident-response procedure in the Phase 2 threat model.
6. Do not resume generation until the root cause is fixed and all critical gates are green.

## Observability without confidential logging

Safe operational fields:

- tenant-scoped opaque IDs;
- run and job status;
- provider/model/version;
- attempt count;
- token counts;
- latency;
- estimated cost;
- failure code;
- request and correlation IDs.

Do not log:

- prompts;
- questionnaire contents;
- evidence text or quotations;
- model reasoning;
- access tokens;
- signed URLs;
- secrets;
- service-role credentials.

## Rollback

Application rollback may redeploy a previously reviewed Worker or console build. Database migrations are forward-only. Correct schema problems with a reviewed follow-up migration; do not rewrite or delete historical generation provenance.
