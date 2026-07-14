# Attestly Remaining Implementation Plan

**Status:** Binding execution contract

**Trigger phrase:** `build`

**Repository:** `febufenn-cyber/attestly-1`

**Target branch:** `main`

## 1. Purpose

This document is the source of truth for finishing Attestly after Phases 1 through 4 and the
merged portions of Phase 5. Before implementing a phase, the agent must verify the repository
against this plan, identify the next incomplete slice, complete it, test it, push it, merge it to
`main`, and report exact proof.

This document never authorizes bypassing security, CI, migrations, tenant isolation, or the
product constitution.

## 2. Remaining work

The original roadmap contains eight phases.

- Phase 1: product specification and system design — complete.
- Phase 2: secure product foundation — complete.
- Phase 3: policy and evidence ingestion — complete.
- Phase 4: questionnaire import and normalization — complete.
- Phase 5: evidence-grounded answer generation — in progress.
- Phase 6: human review, approval, reuse, and export — not started.
- Phase 7: production security, evaluation, integrations, and billing — not started.
- Phase 8: beta, launch, and iteration — not started.

Therefore, three full phases remain after Phase 5: Phases 6, 7, and 8. The unfinished remainder
of Phase 5 must be completed first.

The remaining implementation contains 17 delivery slices plus four phase exit reviews:

- Three remaining Phase 5 slices.
- Five Phase 6 slices.
- Five Phase 7 slices.
- Four Phase 8 slices.

## 3. Meaning of `build`

When the user says `build`, the agent must autonomously implement the next incomplete phase.
That means completing every remaining slice in that phase in dependency order, unless a real
external blocker prevents completion.

For each slice, the agent must:

1. Read this plan and the relevant phase documents and ADRs.
2. Inspect `main`, open pull requests, recent merges, CI, migrations, and package structure.
3. Verify the previous slice is merged and present in the current `main` SHA.
4. Create a fresh `agent/<phase-and-slice>` branch from current `main`.
5. Implement the smallest complete vertical slice.
6. Make intentional atomic commits.
7. Push the branch.
8. Open a truthful pull request to `main`.
9. Run every mandatory application, database, security, and phase-specific gate.
10. Repair failures without weakening tests or invariants.
11. Remove temporary workflows, fixtures, trigger files, and debugging artifacts.
12. Merge only when all mandatory checks are green.
13. Verify the merge commit is contained in `main`.
14. Update the status ledger.
15. Report exact completion proof.

A later slice must branch from the newly verified `main`, never from an unmerged or stale branch.
Direct pushes to `main` are prohibited unless repository policy explicitly requires them.

## 4. External blockers

Some work may require user-controlled accounts, credentials, contracts, or real-world input:

- Production Cloudflare, Supabase, model-provider, Google Drive, or Stripe credentials.
- Production DNS and domain control.
- Legal approval of subprocessors, retention, privacy notices, and provider terms.
- Real design-partner questionnaires, evidence, interviews, and commercial approval.

When an external blocker exists, the agent must still complete all repository code, mocks,
fixtures, tests, staging configuration, and runbooks that do not require the missing input. The
agent must report the exact blocker and the smallest human action needed. External validation
must never be fabricated.

## 5. Global gates

### 5.1 Product and evidence gates

- Evidence comes before prose.
- Every material supported claim has exact claim-level provenance.
- Scope is part of truth.
- Unsupported claims abstain or block; they do not become affirmative answers.
- Deterministic code assigns the canonical answer state.
- Imported content is untrusted data, never executable instructions.
- Historical answers are secondary evidence.
- Contradictions remain visible until explicitly resolved.
- Generated content remains a draft until required humans approve it.
- Generation cannot write directly to source artifacts or export destinations.

### 5.2 Security gates

- Tenant and authorization filters run before retrieval.
- Cross-tenant leakage tolerance is zero.
- Every tenant-owned table has RLS.
- Cross-tenant references use composite tenant foreign keys where possible.
- Service-role functions expose the smallest possible surface.
- Secrets, full prompts, source documents, and tokens are excluded from logs.
- Provenance and audit records are append-only for ordinary users.
- Deleted or retired evidence cannot remain retrievable.
- Rate limits, input limits, and safe failure behavior are explicit.

### 5.3 Engineering gates

Every pull request must pass:

- Repository formatting.
- Strict TypeScript type checking.
- All unit tests.
- All deployable application builds.
- Production dependency audit.
- Clean Supabase migration replay from an empty database.
- All pgTAP and tenant-isolation suites.
- Phase-specific adversarial and integration tests.
- Secret and temporary-file review.
- Changed-file review against the intended slice.

### 5.4 Merge proof

A slice is complete only after recording:

- Branch name.
- Commit SHA or SHAs.
- Pull request number and URL.
- Mandatory check results.
- Merge method and merge SHA.
- Verified resulting `main` SHA.
- Key files changed.
- Security and tenant-isolation proof.
- Known limitations and external blockers.
- The next slice.

## 6. Phase 5 — Evidence-grounded answer generation

### Outcome

A frozen questionnaire question can move through authorized retrieval, provider-neutral model
execution, deterministic validation, immutable persistence, and reviewer inspection without any
path to approval or export.

### Completed

- Phase 5 answer doctrine and structured contracts.
- Canonical answer states and atomic claim dispositions.
- Deterministic citation, scope, disclosure, compound-question, answer-format, quantifier, and
  confidence validation.
- Adversarial answer-kernel tests.

### Slice 5.2 — Immutable generation ledger

Implement:

- `generate_answer` job type.
- Runs bound to frozen snapshot, mapped question, requested scope, provider, model, prompt, and
  schema versions.
- Immutable input hash and ordered evidence candidate snapshot.
- Append-only answer revisions, atomic claims, exact citations, model metadata, and validation
  output.
- Retryable, terminal, blocked, and successful states.
- Transactional queue outbox.
- RLS, least-privilege grants, service-role persistence functions, and safe audit events.
- Two-tenant pgTAP attack suite.

Verify:

- Cross-tenant or mismatched candidates cannot persist.
- Input identity cannot be rewritten.
- Citations come only from the frozen candidate set.
- Atomic outputs match the frozen questionnaire request.
- Failed deterministic validation persists only as `blocked_from_automation` with no outward
  value.
- Revisions, claims, and citations are append-only.
- Authenticated users cannot read the privileged outbox.
- Designated reviewers can inspect provenance.

### Slice 5.3 — Retrieval and provider-neutral generation runtime

Implement:

- Provider-neutral model interface.
- One production adapter and one deterministic fake adapter.
- Operation-specific minimal-context prompts.
- Schema-constrained output.
- Existing tenant-safe evidence retrieval integration.
- Input persistence before provider invocation.
- Deterministic materialization after provider invocation.
- Idempotent retries, timeout, cancellation, rate-limit, malformed-output, and provider-failure
  handling.
- Token and cost metadata without confidential prompt logging.
- Queue consumer, dead-letter behavior, authenticated request API, and run-status API.

Verify:

- End-to-end fake-provider tests cover supported, partial, contradicted, no-evidence, and blocked
  outcomes.
- Prompt injection cannot alter tools, system behavior, or schema.
- Malformed output fails closed.
- Retries do not duplicate immutable revisions.
- Retrieval cannot access another tenant or unauthorized restricted evidence.
- Provider failures create the correct safe state.

### Slice 5.4 — Draft inspection console and evaluation harness

Implement:

- Question list with generation state.
- Draft detail view with question, claims, state, outward draft, exact citations, scope, freshness,
  disclosure restrictions, contradictions, missing information, confidence, provider metadata,
  and validation errors.
- Regeneration as a new immutable run.
- Versioned adversarial evaluation runner and machine-readable report.
- Metrics for state accuracy, citation validity, scope accuracy, abstention precision, fabricated
  citations, prompt-injection compliance, and tenant leakage.
- Phase 5 runbook and staging configuration.

Verify:

- Fabricated citations are zero.
- Cross-tenant leakage is zero.
- Unsafe prompt-injection compliance is zero.
- Blocked outputs show no outward value.
- Every material supported claim is traceable to an exact span.
- The console shows limitations rather than hiding them.

### Phase 5 exit review

Phase 5 is complete only when all remaining slices are merged to `main`, the full
retrieval-to-inspection path works, no approval or export can occur accidentally, and critical
Phase 5 evaluation gates pass.

## 7. Phase 6 — Human review, approval, reuse, and export

### Slice 6.1 — Review domain and immutable human revisions

Implement review queues, assignments, comments, immutable human revisions, field and claim edit
history, optimistic concurrency, explicit review states, RLS, and role enforcement.

Verify that users cannot approve outside their roles, stale revisions cannot be unknowingly
approved, concurrent edits cannot silently overwrite each other, and model provenance survives
human editing.

### Slice 6.2 — Risk-based approvals and invalidation

Implement deterministic risk tiers, required security and legal roles, self-approval limits,
high-risk escalation, approval invalidation, constrained bulk approval, and expiring waivers.

Verify that edits, citation changes, scope changes, evidence expiry, supersession, contradictions,
risk changes, and condition changes invalidate dependent approval. Critical answers cannot be
self-approved, and waivers cannot turn unsupported claims into supported claims.

### Slice 6.3 — Trusted answer library and controlled reuse

Implement reusable records derived from approved final revisions. Store scope, product,
environment, region, customer, effective date, evidence set, and approval identity. Add trust
ranking, duplicate detection, semantic suggestions, staleness handling, and reuse feedback.

Verify that historical text alone cannot create support, scope mismatch is blocked or downgraded,
invalidated answers disappear from trusted suggestions, and reuse never bypasses new evidence
validation.

### Slice 6.4 — Approved export integration

Implement export plans derived only from a frozen questionnaire snapshot and stable approved
revision IDs. Add deterministic conditions, changed-field manifest, XLSX and CSV export,
compatible DOCX support, manual completion packages, structural reopening and validation, secure
downloads, checksums, and audit records.

Verify that unapproved, invalidated, stale, or blocked answers cannot enter an export plan. Model
output cannot bypass approved revision IDs. Unexpected structural changes block export, and every
changed cell or field is reviewable.

### Slice 6.5 — Reviewer console completion

Implement the complete review workspace: evidence inspection, claim editing, comments,
assignments, approvals, waivers, invalidation indicators, history, constrained bulk actions,
export preview, diff, and secure download.

Verify that every critical workflow is usable without developer tools, browser authorization
matches database authorization, and no unsupported answer is presented as ready.

### Phase 6 exit review

Phase 6 is complete when a customer can import a questionnaire, generate drafts, edit and review
claims, obtain all required approvals, and export a structure-preserving approved artifact with
complete provenance and audit history.

## 8. Phase 7 — Production security, evaluation, integrations, and billing

### Slice 7.1 — Security and privacy hardening

Implement authorization matrix tests, secure headers, CORS, CSRF strategy where needed, tenant
rate limits, quotas, secret rotation runbooks, log redaction, retention, deletion jobs, backup and
restore procedures, incident hooks, subprocessor inventory, and dependency or container scans.

Verify that deleted evidence is unusable, logs contain no source passages or secrets, rate-limit
and oversized-input attacks fail safely, browser bundles contain no service credentials, and
restore tests preserve tenant boundaries.

### Slice 7.2 — Production evaluation and release governance

Implement versioned gold and adversarial corpora, full regression reports, provider and prompt
comparison, critical release blockers, manual promotion records, drift detection, reviewer
correction telemetry, and prompt or provider rollback.

Verify that zero-tolerance failures block release and no model or prompt change ships without a
comparative report.

### Slice 7.3 — Google Drive integration

Implement least-privilege OAuth, encrypted token storage, revocation, selected-file import,
approved-artifact export, tenant-owned connections, idempotent synchronization, and safe handling
of moved, deleted, or permission-revoked files.

Verify that one tenant cannot use another tenant's connection, revoked tokens stop access, and all
Drive content still passes normal ingestion and safety gates.

### Slice 7.4 — Stripe billing and entitlements

Implement trial and subscription lifecycle, checkout, billing portal, signed idempotent webhooks,
tenant entitlements, usage metering, grace periods, payment failure, cancellation, downgrade, and
API or job-boundary entitlement checks.

Verify forged and replayed webhooks fail, duplicates are idempotent, billing cannot grant
cross-tenant access, and test-clock cases cover the full lifecycle.

### Slice 7.5 — Production deployment and operations

Implement reproducible staging and production workflows, migration compatibility checks, smoke
tests, health endpoints, queue and provider alerts, SLOs, dashboards, correlation IDs, rollback,
disaster recovery, and production readiness records.

Verify staging is reproducible from `main`, smoke tests cover every trust boundary, and failed
deployments cannot silently leave partial migrations.

### Phase 7 exit review

Phase 7 is complete when the service can be operated securely, release is controlled by
evaluation gates, entitlements are enforced, integrations use least privilege, deletion works,
and rollback and incident procedures are documented and tested.

## 9. Phase 8 — Beta, launch, and iteration

### Slice 8.1 — Design-partner beta package

Implement secure tenant provisioning, invites, guided onboarding, safe demo data, feedback
capture, redacted support bundles, onboarding progress, migration runbooks, feature flags, and a
beta allowlist.

Verify sample data cannot enter customer exports, support bundles redact sensitive content, and
onboarding cannot bypass evidence or questionnaire gates.

### Slice 8.2 — Product analytics and outcome measurement

Implement privacy-conscious events for questionnaire cycle time, reviewer time, accepted-draft
rate, correction rate, abstention, export success, time to value, funnels, cohorts, opt-out, and
retention controls.

Verify analytics contains classifications and identifiers rather than confidential text, metrics
reconcile with database facts, and tenant analytics remain isolated.

### Slice 8.3 — Launch readiness and public release

Implement production domain and email configuration, status and support channels, product and
security documentation, vulnerability reporting, pricing alignment, named launch owners, backup
verification, rollback rehearsal, final evaluation, and staged public rollout.

Verify public claims match implemented capabilities, critical gates are green, and legal or
commercial approvals are recorded rather than invented.

### Slice 8.4 — Post-launch iteration system

Implement feedback triage, weekly operating review, guarded experiments, prompt and provider
change governance, deprecation policy, and scale, revise, or kill decision reports.

Verify safety regressions cannot ship as experiments, experiments cannot cross tenant boundaries,
and success metrics are declared before execution.

### Phase 8 exit review

Phase 8 is complete when a controlled beta tenant can finish the end-to-end workflow, repository
and infrastructure launch gates are green, external blockers are explicit, production status is
truthful, and post-launch metrics and governance are active.

## 10. Pre-build verification checklist

Before every phase, answer from repository evidence:

1. What is the current `main` SHA?
2. What is the next incomplete slice?
3. Is there an existing PR for it?
4. Are earlier PRs stale, conflicting, or unmerged?
5. Did the previous slice pass post-merge verification?
6. Which constitution rules and ADRs constrain the work?
7. Which schemas, APIs, workers, consoles, migrations, and tests already exist?
8. What are the exact acceptance tests?
9. What tenant, authorization, prompt-injection, data-loss, and export risks are introduced?
10. Which external credentials are missing, and what can still be completed without them?
11. What is the rollback path?
12. Which CI jobs must pass?
13. Which temporary artifacts must be absent?
14. Which documentation and status entries must change?

The agent should resolve these questions autonomously from repository and connected-tool evidence.
It should not ask the user to repeat information that is already available.

## 11. Completion report

After every merged slice, report:

```text
Phase / slice:
Outcome:
Branch:
Commits:
Pull request:
Checks:
Merge method:
Merge SHA:
Verified main SHA:
Key files changed:
Security and tenant-isolation proof:
Known limitations or external blockers:
Next slice:
```

A statement such as "done" without this proof is insufficient.

## 12. Status ledger

A checked item means the code is merged to `main`, mandatory CI is green, and the merge is
verified.

### Phase 5

- [x] 5.1 Deterministic answer kernel.
- [ ] 5.2 Immutable generation ledger.
- [ ] 5.3 Retrieval and provider-neutral generation runtime.
- [ ] 5.4 Draft inspection console and evaluation harness.
- [ ] Phase 5 exit review.

### Phase 6

- [ ] 6.1 Review domain and immutable human revisions.
- [ ] 6.2 Risk-based approvals and invalidation.
- [ ] 6.3 Trusted answer library and controlled reuse.
- [ ] 6.4 Approved export integration.
- [ ] 6.5 Reviewer console completion.
- [ ] Phase 6 exit review.

### Phase 7

- [ ] 7.1 Security and privacy hardening.
- [ ] 7.2 Production evaluation and release governance.
- [ ] 7.3 Google Drive integration.
- [ ] 7.4 Stripe billing and entitlements.
- [ ] 7.5 Production deployment and operations.
- [ ] Phase 7 exit review.

### Phase 8

- [ ] 8.1 Design-partner beta package.
- [ ] 8.2 Product analytics and outcome measurement.
- [ ] 8.3 Launch readiness and public release.
- [ ] 8.4 Post-launch iteration system.
- [ ] Phase 8 exit review.

## 13. First action after the next `build`

Inspect the current Phase 5 immutable-generation-ledger pull request.

- If it is green, correct, current, and free of temporary artifacts, merge it and verify `main`.
- If it is failing or stale, repair it on its branch, rerun every gate, merge it, and verify
  `main`.
- If it is unsafe to repair, close it with an explanation, reimplement Slice 5.2 from current
  `main`, validate it, and merge it.

Only after Slice 5.2 is verified in `main` may Slice 5.3 begin.

## 14. Definition of autonomous completion

A phase is autonomously complete when the agent performs repository discovery, finishes every
remaining slice in dependency order, commits and pushes intentionally, creates and validates each
pull request, merges each green slice to `main`, verifies every merge, updates status, and provides
the completion report.

The agent stops only for a real external blocker, safety boundary, unavailable capability, or
irrecoverable repository permission failure. Truthful, tested, merged progress is more important
than optimistic status claims.
