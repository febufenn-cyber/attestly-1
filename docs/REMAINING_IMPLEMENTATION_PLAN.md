# Attestly Remaining Implementation Plan

**Status:** Binding execution contract  
**Trigger phrase:** `build`  
**Repository:** `febufenn-cyber/attestly-1`  
**Target branch:** `main`

## 1. Purpose

This document is the source of truth for finishing Attestly after the completed Phase 1–5 engineering slices. Before implementing a phase, the agent must verify the repository against this plan, identify the next incomplete slice, implement it, test it, push it, merge it to `main`, verify the resulting `main` SHA, and report exact proof.

This document never authorizes bypassing security, CI, migrations, tenant isolation, product-constitution rules, or honest external-validation requirements.

## 2. Current state

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Product specification and system design | Complete |
| 2 | Secure product foundation | Complete |
| 3 | Evidence ingestion, provenance, approval, and retrieval | Complete |
| 4 | Questionnaire intelligence and reversible export | Complete |
| 5 | Evidence-grounded answer generation and inspection | Complete |
| 6 | Human review, approval, reuse, and approved export | Not started |
| 7 | Production security, evaluation, integrations, and billing | Not started |
| 8 | Beta, launch, and iteration | Not started |

Three full phases remain: Phases 6, 7, and 8. They contain 14 delivery slices plus three phase exit reviews:

- five Phase 6 slices;
- five Phase 7 slices;
- four Phase 8 slices.

## 3. Meaning of `build`

When the user says `build`, the agent must autonomously implement the next incomplete phase in dependency order unless a real external blocker prevents completion.

For every slice, the agent must:

1. Read this plan and the relevant phase documents and ADRs.
2. Inspect `main`, open pull requests, recent merges, CI, migrations, and package structure.
3. Verify the previous slice is merged and present in the current `main` SHA.
4. Create a fresh `agent/<phase-and-slice>` branch from current `main`.
5. Implement the smallest complete vertical slice.
6. Make intentional atomic commits and push the branch.
7. Open a truthful pull request to `main`.
8. Run every mandatory application, database, security, and phase-specific gate.
9. Repair failures without weakening tests or invariants.
10. Remove temporary workflows, triggers, diagnostics, and opaque staging artifacts.
11. Merge only when all mandatory gates are green.
12. Verify the merge commit is contained in `main`.
13. Update this status ledger.
14. Report the branch, commits, PR, checks, merge SHA, resulting `main` SHA, security proof, blockers, and next slice.

A later slice must branch from the newly verified `main`, never from an unmerged or stale branch. Direct pushes to `main` are prohibited unless repository policy explicitly requires them.

## 4. External blockers

Some work may require user-controlled accounts, credentials, contracts, or real-world input:

- production Cloudflare, Supabase, model-provider, Google Drive, or Stripe credentials;
- production DNS and domain control;
- legal approval of subprocessors, retention, privacy notices, and provider terms;
- real design-partner questionnaires, evidence, interviews, and commercial approval.

When an external blocker exists, the agent must still complete all repository code, mocks, fixtures, tests, staging configuration, and runbooks that do not require the missing input. It must report the exact blocker and the smallest human action needed. External validation must never be fabricated.

## 5. Global gates

### Product and evidence

- Evidence comes before prose.
- Every material supported claim has exact claim-level provenance.
- Scope is part of truth.
- Unsupported claims abstain or block; they do not become affirmative answers.
- Deterministic code assigns canonical answer state and approval eligibility.
- Imported content is untrusted data, never executable instructions.
- Historical answers are secondary evidence.
- Contradictions remain visible until explicitly resolved.
- Generated content remains a draft until required humans approve it.
- Model output cannot write directly to source artifacts, approval tables, or export destinations.

### Security

- Tenant and authorization filters run before retrieval and before every mutation.
- Cross-tenant leakage tolerance is zero.
- Every tenant-owned table has RLS.
- Cross-tenant relationships use composite tenant foreign keys where possible.
- Service-role functions expose the smallest possible surface.
- Secrets, full prompts, source documents, and access tokens are excluded from logs.
- Provenance, revisions, approvals, and audit history are append-only for ordinary users.
- Deleted or retired evidence cannot remain retrievable or reusable.
- Rate limits, quotas, input limits, and safe failure are explicit.

### Engineering

Every pull request must pass:

- repository formatting;
- strict TypeScript;
- all unit tests;
- every deployable build;
- production dependency audit;
- clean Supabase migration replay from an empty database;
- all pgTAP and tenant-isolation suites;
- phase-specific adversarial and integration tests;
- secret and temporary-file review;
- changed-file review against the intended slice.

## 6. Completed Phase 5 contract

Phase 5 is complete as a pre-approval engineering vertical slice. A frozen questionnaire question can move through authorized retrieval, provider-neutral generation, deterministic validation, immutable persistence, and reviewer inspection without any path to approval or export.

Completed slices:

- [x] 5.1 Deterministic answer kernel.
- [x] 5.2 Immutable generation ledger.
- [x] 5.3 Retrieval and provider-neutral generation runtime.
- [x] 5.4 Draft inspection console and adversarial evaluation harness.
- [x] Phase 5 exit review.

Phase 5 guarantees:

- exact immutable input and candidate snapshots;
- claim-level citations from the eligible candidate set only;
- safe no-evidence, partial, historical, scope-mismatch, contradiction, SME/legal, ambiguity, and blocked states;
- provider-neutral fake and Anthropic adapters;
- bounded retries, cancellation, dead-letter handling, and no prompt logging;
- read-only inspection with regeneration as a new immutable run;
- machine-readable critical release metrics in CI;
- no approval or export authority.

## 7. Phase 6 — Human review, approval, reuse, and export

### Slice 6.1 — Review domain and immutable human revisions

Implement review queues, assignments, comments, immutable human revisions, field- and claim-level edit history, optimistic concurrency, explicit review states, RLS, and role enforcement.

Verify that users cannot approve outside their roles, stale revisions cannot be unknowingly approved, concurrent edits cannot silently overwrite each other, and model provenance survives human editing.

### Slice 6.2 — Risk-based approvals and invalidation

Implement deterministic risk tiers, required security and legal roles, self-approval limits, high-risk escalation, approval invalidation, constrained bulk approval, and expiring waivers.

Verify that edits, citation changes, scope changes, evidence expiry, supersession, contradictions, risk changes, and condition changes invalidate dependent approval. Critical answers cannot be self-approved, and waivers cannot turn unsupported claims into supported claims.

### Slice 6.3 — Trusted answer library and controlled reuse

Implement reusable records derived from approved final revisions. Store scope, product, environment, region, customer, effective date, evidence set, and approval identity. Add trust ranking, duplicate detection, semantic suggestions, staleness handling, and reuse feedback.

Verify that historical text alone cannot create support, scope mismatch is blocked or downgraded, invalidated answers disappear from trusted suggestions, and reuse never bypasses new evidence validation.

### Slice 6.4 — Approved export integration

Implement export plans derived only from a frozen questionnaire snapshot and stable approved revision IDs. Add deterministic conditions, changed-field manifests, XLSX and CSV export, compatible DOCX support, manual completion packages, structural reopening and validation, secure downloads, checksums, and audit records.

Verify that unapproved, invalidated, stale, or blocked answers cannot enter an export plan. Model output cannot bypass approved revision IDs. Unexpected structural changes block export, and every changed cell or field is reviewable.

### Slice 6.5 — Reviewer console completion

Implement the complete review workspace: evidence inspection, claim editing, comments, assignments, approvals, waivers, invalidation indicators, history, constrained bulk actions, export preview, diff, and secure download.

Verify that every critical workflow is usable without developer tools, browser authorization matches database authorization, and no unsupported answer is presented as ready.

### Phase 6 exit review

Phase 6 is complete when a customer can import a questionnaire, generate drafts, edit and review claims, obtain all required approvals, and export a structure-preserving approved artifact with complete provenance and audit history.

## 8. Phase 7 — Production security, evaluation, integrations, and billing

### Slice 7.1 — Security and privacy hardening

Implement authorization-matrix tests, secure headers, CORS and CSRF strategy, tenant rate limits and quotas, secret rotation, log redaction, retention, deletion jobs, backup and restore procedures, incident hooks, subprocessor inventory, and dependency or container scans.

### Slice 7.2 — Production evaluation and release governance

Implement expanded gold and adversarial corpora, comparative provider and prompt reports, release blockers, manual promotion records, drift detection, reviewer-correction telemetry, and rollback.

### Slice 7.3 — Google Drive integration

Implement least-privilege OAuth, encrypted token storage, revocation, selected-file import, approved-artifact export, tenant-owned connections, idempotent synchronization, and safe handling of moved, deleted, or permission-revoked files.

### Slice 7.4 — Stripe billing and entitlements

Implement trial and subscription lifecycle, checkout, billing portal, signed idempotent webhooks, tenant entitlements, usage metering, grace periods, payment failure, cancellation, downgrade, and API/job-boundary entitlement checks.

### Slice 7.5 — Production deployment and operations

Implement reproducible staging and production workflows, migration compatibility, smoke tests, health endpoints, queue and provider alerts, SLOs, dashboards, correlation IDs, rollback, disaster recovery, and production-readiness records.

### Phase 7 exit review

Phase 7 is complete when the service can be deployed, operated, secured, billed, integrated, observed, restored, and promoted through a controlled release process without weakening tenant or evidence boundaries.

## 9. Phase 8 — Beta, launch, and iteration

### Slice 8.1 — Design-partner beta package

Implement tenant provisioning, sample evidence and questionnaires, guided onboarding, support and feedback workflows, privacy and retention controls, issue triage, and a design-partner runbook. Real customer use requires real partner consent and artifacts.

### Slice 8.2 — Product analytics and outcome measurement

Implement privacy-preserving funnel, time-to-first-draft, reviewer time, acceptance, correction, abstention, evidence-gap, export, reliability, cost, retention, and revenue metrics without source-content analytics.

### Slice 8.3 — Launch readiness and public release

Implement production smoke tests, status and support surfaces, onboarding, pricing and trial copy, privacy and terms placeholders pending legal approval, kill-switch and feature flags, rollback, and launch checklist.

### Slice 8.4 — Post-launch iteration system

Implement feedback triage, correction taxonomy, evaluation-case promotion, weekly product and model reviews, experiment guardrails, release notes, deprecation policy, and kill-or-scale decision templates.

### Phase 8 exit review

Phase 8 is complete only when beta evidence supports launch, required external approvals exist, production gates pass, early outcomes are measured honestly, and the repository contains the operational proof required for release.

## 10. Status ledger

A checked item means code is merged to `main`, mandatory CI is green, and the merge is verified.

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

## 11. First action after the next `build`

Start Phase 6 Slice 6.1 from the verified Phase 5 merge SHA. Implement the review domain and immutable human revisions, run every application, database, security, and Phase 6 gate, merge only a green pull request, and verify the resulting `main` SHA before Slice 6.2 begins.

## 12. Definition of autonomous completion

A phase is autonomously complete when the agent performs repository discovery, finishes every remaining slice in dependency order, commits and pushes intentionally, creates and validates each pull request, merges every green slice to `main`, verifies every merge, updates this status ledger, and reports exact completion proof.

The agent stops only for a real external blocker, safety boundary, unavailable capability, or irrecoverable repository permission failure. Truthful, tested, merged progress is more important than optimistic status claims.
