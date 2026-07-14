# Attestly Remaining Implementation Plan

**Document status:** Binding execution contract  
**Applies after:** Phase 1 through Phase 4 and the merged portions of Phase 5  
**Trigger phrase:** `build`  
**Repository:** `febufenn-cyber/attestly-1`  
**Default target branch:** `main`

## 1. Purpose

This document is the source of truth for completing Attestly after the product constitution, project foundation, evidence ingestion, questionnaire intelligence, and the initial Phase 5 answer kernel.

It exists so that before implementing any remaining phase, the implementing agent can:

1. verify the current repository state against an explicit plan;
2. identify the next incomplete phase and slice;
3. implement it autonomously without repeating discovery work;
4. test it against objective release gates;
5. commit and push the work intentionally;
6. merge only verified changes into `main`; and
7. report exact proof of completion.

This document does not authorize bypassing security, CI, review, migration, or product-constitution requirements.

---

## 2. How many phases remain

Attestly uses the original eight-phase roadmap.

| Phase | Name                                                       | Status at creation of this document |
| ----- | ---------------------------------------------------------- | ----------------------------------- |
| 1     | Product specification and system design                    | Complete                            |
| 2     | Project foundation                                         | Complete                            |
| 3     | Policy and evidence ingestion                              | Complete                            |
| 4     | Questionnaire import and normalization                     | Complete                            |
| 5     | Evidence-grounded answer generation                        | In progress                         |
| 6     | Human review, approval, reuse, and export                  | Not started                         |
| 7     | Production security, evaluation, integrations, and billing | Not started                         |
| 8     | Beta, launch, and iteration                                | Not started                         |

Therefore:

- **Three full phases remain after Phase 5:** Phases 6, 7, and 8.
- **The unfinished remainder of Phase 5 must be completed first.**
- The command `build` means: implement the next incomplete phase or phase slice described here, through a verified merge to `main`, unless an honest external blocker prevents completion.

---

## 3. Binding execution model

### 3.1 Meaning of `build`

When the user says `build`, the implementing agent must:

1. read this document and the current phase documentation;
2. inspect `main`, open pull requests, recent merges, CI state, migrations, and package structure;
3. determine the next incomplete slice from the status ledger;
4. verify all readiness gates for that slice;
5. create a fresh `agent/<phase-and-slice>` branch from the current `main` SHA;
6. implement the slice completely;
7. make intentional atomic commits;
8. push the branch;
9. open a pull request to `main` with a truthful scope and validation summary;
10. run the full required CI and security gates;
11. fix failures without weakening tests or product invariants;
12. merge the pull request only when every mandatory gate is green;
13. verify the resulting `main` SHA contains the merge;
14. update the status ledger in this document or a later superseding status document; and
15. report the branch, commits, pull request, checks, merge SHA, and resulting `main` state.

The agent must not stop merely because the work is large. It should complete the requested phase in one autonomous execution whenever the available tools and credentials make that possible.

### 3.2 Slice and merge policy

Each phase is divided into independently safe slices.

- Every slice must leave `main` deployable and internally consistent.
- A slice may contain multiple atomic commits.
- Every completed slice must be pushed, validated in a pull request, and merged to `main` before work begins on the next dependent slice.
- A later slice must branch from the newly verified `main`, never from an unmerged stale branch.
- Direct pushes to `main` are prohibited unless repository policy explicitly requires them.
- Temporary workflows, fixtures, trigger files, and debugging artifacts must be removed before merge.

### 3.3 No silent scope changes

If implementation reveals a missing requirement, the agent must either:

- implement it when it is necessary for correctness or security and document the addition; or
- record it as a deferred item with a precise reason and risk.

The agent must not silently remove a release gate, weaken authorization, loosen tenant isolation, reduce validation, or label an incomplete feature complete.

### 3.4 External blockers

The following may require user-controlled credentials, contracts, accounts, or real-world participation:

- production Cloudflare, Supabase, Anthropic or other model-provider credentials;
- Stripe account and production webhook secrets;
- Google Drive OAuth production configuration;
- legal approval of subprocessors, retention, and model-provider terms;
- real design-partner documents and interviews;
- production domain and DNS control;
- customer security or privacy commitments.

When an external blocker exists, the agent must still complete all repository implementation, automated tests, mocks, local/staging configuration, runbooks, and validation that do not require the missing external input. It must then report the exact blocker and the smallest human action needed. It must never fabricate external validation.

---

## 4. Global non-negotiable gates

Every remaining slice must preserve all earlier phase invariants.

### 4.1 Product and evidence invariants

- Evidence before prose.
- Claim-level provenance.
- Scope is part of truth.
- Unsupported claims abstain or block; they do not become affirmative answers.
- The model cannot assign the canonical answer state without deterministic validation.
- Imported files and document text are untrusted data, never executable instructions.
- Historical answers are secondary evidence and cannot outrank current approved evidence.
- Contradictions remain visible until explicitly resolved.
- Generated content is a draft until the required humans approve it.
- Generation cannot write directly to source questionnaire artifacts or export destinations.

### 4.2 Security invariants

- Tenant and authorization filters occur before retrieval.
- Cross-tenant leakage tolerance is zero.
- Service-role functions expose the smallest possible surface.
- RLS is enabled for every tenant-owned table.
- Composite tenant foreign keys are used where cross-tenant references are possible.
- Secrets, full prompts, sensitive source documents, and access tokens are excluded from logs.
- Append-only provenance and audit records cannot be rewritten by ordinary users.
- Deleted or retired evidence must not remain retrievable.
- Rate limits, input limits, and safe failure behavior are explicit.

### 4.3 Engineering gates

Unless a phase explicitly adds stricter gates, every pull request must pass:

- repository formatting;
- strict TypeScript type checking;
- all unit tests;
- all deployable application builds;
- production dependency audit;
- clean Supabase migration replay from an empty database;
- all pgTAP suites, including tenant-isolation tests;
- phase-specific adversarial and integration tests;
- no committed secrets or generated credentials;
- a clean changed-file review with no temporary files.

### 4.4 Merge verification

A merge is complete only when all of the following are recorded:

- pull request number and URL;
- head branch name;
- head commit SHA;
- all mandatory checks green;
- merge method;
- merge commit SHA;
- confirmation that `main` points at or contains that merge;
- confirmation that the merged diff matches the intended slice;
- remaining work and blockers.

---

## 5. Phase 5 — Evidence-grounded answer generation

### 5.1 Outcome

For every frozen questionnaire question, Attestly can retrieve only authorized and scope-compatible evidence, create a provider-neutral structured model request, validate the structured model response deterministically, persist exact claim-level provenance, and expose a reviewable draft without writing to an export destination.

### 5.2 Already completed

- Phase 5 answer doctrine and structured contracts.
- Canonical answer states and claim dispositions.
- Deterministic validation of citations, scope, disclosure, compound questions, formats, quantifiers, and confidence caps.
- Adversarial unit fixtures for the answer kernel.
- Initial immutable generation-ledger work may exist in an open pull request and must be verified before it is treated as complete.

### 5.3 Slice 5.2 — Immutable generation ledger

**Goal:** Persist a replayable, tenant-safe generation lifecycle.

Required implementation:

- `generate_answer` job type;
- generation runs bound to frozen questionnaire snapshot, mapped question, provider, model, prompt version, schema version, operation, requested scope, and requester;
- immutable generation input hash;
- ordered immutable candidate snapshots referencing exact evidence spans and versions;
- append-only answer revisions, atomic claim results, exact citations, validation output, model metadata, and token/cost metadata where available;
- retryable, terminal, blocked, and successful states;
- transactional queue outbox;
- RLS and least-privilege grants;
- service-role-only persistence functions;
- audit events without source document or prompt leakage;
- two-tenant pgTAP attack suite.

Verification gates:

- invalid or cross-tenant candidates cannot persist;
- input identity cannot be mutated after persistence;
- citations must come from the frozen candidate set;
- atomic results must match the frozen Phase 4 atomic request;
- failed deterministic validation can persist only as `blocked_from_automation` with no outward value;
- revisions, claims, and citations are append-only;
- authenticated users cannot inspect the privileged outbox;
- designated reviewers can inspect draft provenance;
- clean migration replay and all pgTAP suites pass.

### 5.4 Slice 5.3 — Retrieval and provider-neutral generation runtime

**Goal:** Execute the complete retrieval-to-draft pipeline as a background worker.

Required implementation:

- provider-neutral `ModelProvider` interface;
- one production adapter behind the interface and one deterministic fake adapter for tests;
- operation-specific prompt templates containing only the minimum authorized context;
- schema-constrained structured output;
- tenant-safe evidence search through existing database functions;
- candidate normalization into the Phase 5 answer contract;
- input hashing and persistence before model invocation;
- deterministic materialization after model invocation;
- idempotent retry behavior;
- timeout, cancellation, rate-limit, malformed-output, and provider-failure handling;
- cost/token capture without logging confidential prompts;
- queue consumer and dead-letter behavior;
- authenticated API endpoint to request a draft and inspect run status;
- no API path that lets a browser invoke a provider with service credentials directly.

Verification gates:

- fake-provider end-to-end tests cover supported, partial, contradicted, no-evidence, and blocked paths;
- prompt-injection text in source documents cannot alter tools, system behavior, or output schema;
- malformed provider output fails closed;
- retries do not duplicate immutable revisions;
- retrieval cannot access another tenant or unauthorized restricted evidence;
- provider timeout and rate limit produce safe retryable states;
- token and cost records contain no source text;
- worker and API builds pass.

### 5.5 Slice 5.4 — Draft inspection console and Phase 5 evaluation harness

**Goal:** Make generated drafts inspectable and prove the pipeline is safe enough to hand to reviewers.

Required implementation:

- question list with generation state;
- draft detail view showing original question, atomic claims, canonical state, outward draft, exact citations, evidence scope, freshness, disclosure restrictions, contradictions, missing information, confidence dimensions, provider metadata, and validation errors;
- safe regeneration action that creates a new immutable run rather than mutating a prior revision;
- adversarial evaluation runner using versioned fixtures;
- machine-readable evaluation report;
- metrics for state accuracy, citation validity, scope accuracy, abstention precision, fabricated citation count, injection compliance count, and tenant leakage count;
- Phase 5 operational runbook and staging configuration;
- no approval or export action yet.

Verification gates:

- fabricated citations: zero;
- cross-tenant leakage: zero;
- unsafe prompt-injection compliance: zero;
- blocked outputs show no outward value;
- reviewer can trace every material supported claim to an exact span;
- console exposes limitations instead of hiding them;
- evaluation thresholds in `docs/phase-1/EVALUATION_AND_LAUNCH_GATES.md` are enforced in CI where the corpus supports them.

### 5.6 Phase 5 exit criteria

Phase 5 is complete only when:

- all three remaining slices are merged to `main`;
- a question can travel from frozen snapshot through authorized retrieval, provider execution, deterministic validation, immutable persistence, and visual inspection;
- no approval or export can occur accidentally;
- the Phase 5 evaluation report passes every critical safety gate;
- documentation accurately identifies any provider credential still needed for production.

---

## 6. Phase 6 — Human review, approval, reuse, and export

### 6.1 Outcome

Authorized humans can edit, review, approve, invalidate, reuse, and export answer revisions through explicit risk-based workflows. Export is generated only from a stable approved snapshot and preserves the source questionnaire structure.

### 6.2 Slice 6.1 — Review domain and immutable human revisions

Required implementation:

- review workspaces and queues by questionnaire, section, risk, state, assignee, and blocker;
- human answer revisions separated from model revisions;
- field-level and claim-level edit history;
- reviewer comments and resolution threads;
- assignment and ownership;
- explicit states such as draft, in review, changes requested, approved, invalidated, waived, and superseded;
- immutable audit trail for every edit and decision;
- optimistic concurrency or revision preconditions to prevent lost updates;
- RLS and role enforcement for contributor, security reviewer, legal reviewer, final approver, viewer, and auditor.

Verification gates:

- users cannot approve outside their role;
- a reviewer cannot unknowingly approve a stale revision;
- concurrent edits cannot silently overwrite one another;
- model provenance remains intact after human editing;
- every outward claim remains linked to evidence, a human assertion, or an explicit waiver.

### 6.3 Slice 6.2 — Risk-based approvals and invalidation

Required implementation:

- deterministic risk classification and required reviewer roles;
- separate security, privacy/legal, and final approval decisions;
- self-approval restrictions;
- high-risk and critical answer escalation;
- approval invalidation when answer text, citations, scope, evidence lifecycle, contradiction state, risk tier, questionnaire snapshot, or conditional activation changes;
- bulk approval only for eligible low-risk homogeneous answers;
- waiver workflow with rationale, owner, expiry, and required approvers;
- approval summary and unresolved-blocker dashboard.

Verification gates:

- approval bypass attempts fail;
- editing an approved answer invalidates approval;
- superseded or expired evidence invalidates dependent approvals;
- waivers cannot silently convert unsupported claims into supported claims;
- critical answers cannot be self-approved;
- bulk approval cannot include mixed or high-risk states.

### 6.4 Slice 6.3 — Trusted answer library and controlled reuse

Required implementation:

- reusable answer records derived from approved final revisions;
- scope, product, environment, region, customer, effective date, evidence set, and approval identity stored with every reusable answer;
- trust score based on evidence, freshness, approval, edit history, and reuse performance;
- exact duplicate and semantic similarity detection;
- reuse suggestions, never silent automatic replacement;
- stale, contradictory, scope-mismatched, or invalidated answers excluded or clearly downgraded;
- provenance from reused answer back to original questionnaire and evidence;
- reviewer feedback captured for future ranking.

Verification gates:

- historical answer text alone cannot create a supported state;
- cross-scope reuse is blocked or clearly marked partial/unknown;
- invalidated answers stop appearing as trusted suggestions;
- reuse does not erase the new questionnaire's own evidence validation.

### 6.5 Slice 6.4 — Approved export integration

Required implementation:

- export plan created only from a frozen questionnaire snapshot plus stable approved answer revision IDs;
- answer destinations map to approved outward values and text;
- conditional questions activate deterministically;
- changed-cell or changed-field manifest;
- structure-preserving XLSX and CSV export through the Phase 4 export engine;
- supported DOCX path where compatibility is proven;
- manual completion package for unsupported fields or PDFs;
- output validation by reopening and comparing structure;
- export diff review and final approval;
- export artifact identity, checksum, audit record, and secure download authorization;
- no autonomous portal submission.

Verification gates:

- unapproved, invalidated, stale, or blocked answers cannot enter an export plan;
- model output cannot bypass approved revision IDs;
- formulas, macros, hidden content, styles, validations, and protected structures follow the Phase 4 safety rules;
- unexpected structural changes block export;
- export is reproducible from the same approved snapshot;
- a reviewer can identify exactly which cells or fields changed.

### 6.6 Slice 6.5 — Reviewer console completion

Required implementation:

- end-to-end questionnaire review workspace;
- evidence and citation inspection;
- claim editing;
- comments, assignments, approvals, waivers, invalidation indicators, and history;
- bulk actions constrained by risk policy;
- export preview, diff, and secure download;
- keyboard-efficient workflow for sales and security teams;
- accessibility and responsive desktop-first behavior;
- actionable empty, loading, partial, blocked, and failure states.

Verification gates:

- critical workflow is usable without database or developer tools;
- every destructive or approval action has clear confirmation and audit behavior;
- no hidden unsupported answer is presented as ready;
- browser authorization tests match database authorization.

### 6.7 Phase 6 exit criteria

Phase 6 is complete only when a customer can import a supported questionnaire, generate drafts, review and edit claims, obtain all required approvals, and export a structure-preserving approved artifact with complete provenance and audit history.

---

## 7. Phase 7 — Production security, evaluation, integrations, and billing

### 7.1 Outcome

Attestly is operable as a secure multi-tenant paid SaaS with enforceable evaluation gates, production observability, retention and deletion controls, least-privilege integrations, and entitlement-aware usage.

### 7.2 Slice 7.1 — Security and privacy hardening

Required implementation:

- formal authorization matrix tests across every API and database function;
- CSP, secure headers, CORS allowlist, CSRF strategy where relevant, and cookie/token hardening;
- global and tenant-aware rate limiting;
- upload, extraction, questionnaire, generation, and export quotas;
- secret rotation and environment validation runbooks;
- PII and confidential-content redaction in logs and telemetry;
- retention policies by artifact class;
- deletion request workflow, tombstones, asynchronous deletion jobs, and retrieval exclusion;
- backup and restore procedures;
- incident response hooks and security event taxonomy;
- subprocessor and data-flow inventory;
- dependency and container scanning where supported by CI.

Verification gates:

- cross-tenant security test matrix passes;
- deleted evidence is no longer searchable or usable for generation;
- logs contain no fixture secrets or confidential source passages;
- rate-limit bypass and oversized-input tests pass;
- service-role secrets are never exposed to browser bundles;
- restore test proves tenant boundaries remain intact.

### 7.3 Slice 7.2 — Production evaluation and release governance

Required implementation:

- versioned gold corpus and adversarial corpus management;
- regression runner for import, retrieval, generation, citation, approvals, and export;
- model/provider/prompt comparison reports;
- critical failure categories that block release regardless of aggregate score;
- CI release gate and manual production promotion record;
- reviewer acceptance and correction telemetry with privacy controls;
- drift detection for model, prompt, retrieval, and corpus changes;
- rollback mechanism for prompt and provider versions.

Verification gates:

- thresholds from the Phase 1 evaluation specification are automatically calculated;
- zero-tolerance failures block promotion;
- a model or prompt change cannot ship without a comparative report;
- evaluation data cannot leak across tenants or enter provider training by default.

### 7.4 Slice 7.3 — Google Drive integration

Required implementation:

- OAuth authorization-code flow with state and PKCE where appropriate;
- least-privilege scopes;
- encrypted token storage and revocation;
- import evidence and questionnaires from selected files;
- optional export of approved artifacts to a selected Drive location;
- explicit tenant and user ownership of connections;
- webhook or polling strategy with idempotency;
- safe handling of deleted, moved, or permission-revoked files;
- connection audit history.

Verification gates:

- one tenant cannot use another tenant's connection;
- revoked tokens stop access immediately;
- file content still passes normal malware, validation, ingestion, and scope gates;
- Drive metadata never replaces immutable Attestly object identity.

### 7.5 Slice 7.4 — Stripe billing and entitlements

Required implementation:

- product and price configuration abstraction;
- trial and paid subscription lifecycle;
- checkout and billing portal;
- signed webhook verification and idempotent processing;
- tenant subscription and entitlement tables;
- usage metering for questionnaires, generation, storage, seats, or the selected commercial unit;
- grace periods, failed payment behavior, cancellation, and downgrade handling;
- entitlement checks at API and job-enqueue boundaries;
- admin-visible usage and billing status;
- no billing secrets in client code.

Verification gates:

- forged or replayed webhooks fail;
- duplicate webhooks are idempotent;
- unpaid or over-limit tenants cannot create billable work while retaining safe read/export access according to policy;
- billing state cannot grant cross-tenant access;
- test-clock lifecycle tests cover trial, payment, failure, cancellation, and reactivation.

### 7.6 Slice 7.5 — Production deployment and operations

Required implementation:

- reproducible staging and production deployment workflows;
- environment-specific migrations and compatibility checks;
- smoke tests and health endpoints;
- queue depth, failure, latency, provider cost, export failure, auth anomaly, and tenant-isolation alerting;
- SLOs and error budgets;
- dashboards and structured correlation IDs;
- rollback and disaster recovery runbooks;
- production readiness checklist;
- infrastructure ownership and credential inventory.

Verification gates:

- staging deployment is reproducible from `main`;
- smoke tests cover auth, upload, retrieval, generation, review, approval, and export boundaries;
- failed deployment cannot silently partially migrate production;
- alerts contain enough metadata to diagnose a tenant-safe issue without leaking source content.

### 7.7 Phase 7 exit criteria

Phase 7 is complete only when the application can be operated securely in staging or production, evaluation gates control release, paid entitlements are enforced, integrations use least privilege, retention and deletion are functional, and operations have documented rollback and incident procedures.

---

## 8. Phase 8 — Beta, launch, and iteration

### 8.1 Outcome

Attestly is ready for controlled design-partner use, then public commercial launch, with measurable product value, support operations, feedback loops, and explicit scale-or-kill criteria.

### 8.2 Slice 8.1 — Design-partner beta package

Required implementation:

- secure tenant provisioning and invite flow;
- guided onboarding for workspace, product scope, evidence, and first questionnaire;
- sample workspace and safe demo data;
- beta terms, privacy notices, and in-product limitations language supplied by the business/legal owner;
- feedback capture linked to question and answer revisions without exposing confidential content unnecessarily;
- support diagnostic bundle with redaction;
- onboarding checklist and admin progress;
- migration/import support runbook;
- feature flags and tenant allowlist.

Verification gates:

- beta access is restricted to allowlisted tenants;
- sample data cannot appear in customer exports;
- support bundles redact secrets and source passages by default;
- onboarding cannot bypass evidence approval or questionnaire freezing.

### 8.3 Slice 8.2 — Product analytics and outcome measurement

Required implementation:

- privacy-conscious event taxonomy;
- questionnaire cycle time, reviewer time, accepted-draft rate, correction rate, abstention rate, export success, and time-to-first-value metrics;
- product and reliability funnels;
- tenant-level analytics access controls;
- opt-out and retention controls where required;
- cohort and design-partner reporting;
- no raw evidence or questionnaire text in analytics payloads.

Verification gates:

- analytics events contain identifiers and classifications, not confidential source text;
- metrics reconcile with database facts;
- users cannot view another tenant's analytics;
- telemetry failure does not block critical product work.

### 8.4 Slice 8.3 — Launch readiness and public release

Required implementation:

- production domain, DNS, TLS, and email configuration;
- status and support channels;
- product documentation and security overview;
- incident contact and vulnerability reporting path;
- public pricing and trial behavior aligned with Stripe configuration;
- launch checklist with named owners;
- backup verification and rollback rehearsal;
- final release evaluation report;
- public availability flag and staged rollout;
- support and incident on-call expectations.

Verification gates:

- critical evaluation, security, billing, backup, and smoke gates are green;
- public claims match actual implemented capabilities;
- no autonomous portal submission or certification claim is implied;
- legal and business-controlled launch materials are explicitly approved rather than invented.

### 8.5 Slice 8.4 — Post-launch iteration system

Required implementation:

- structured feedback triage;
- defect, safety incident, customer request, and model-quality categories;
- weekly operating review dashboard;
- experiment framework with guardrails;
- prompt/provider change governance;
- feature deprecation and migration policy;
- scale, revise, or kill decision report based on agreed thresholds;
- roadmap process grounded in observed reviewer behavior and revenue outcomes.

Verification gates:

- safety regressions cannot be shipped as experiments;
- experiments cannot cross tenant or disclosure boundaries;
- success metrics are defined before launch of an experiment;
- feedback-linked product changes retain traceability.

### 8.6 Phase 8 exit criteria

Phase 8 is complete only when:

- at least one controlled beta tenant can complete the end-to-end workflow;
- repository and infrastructure launch gates are green;
- external legal, commercial, domain, and customer-validation items are either completed by their owners or explicitly listed as blockers;
- production launch status is truthfully recorded;
- post-launch metrics and iteration governance are active.

Repository implementation can be complete even when real customer interviews or contracts remain outstanding, but the product must not be described as fully market-validated until that evidence exists.

---

## 9. Pre-build verification checklist

Before every `build` execution, the implementing agent must answer these questions from repository evidence:

1. What is the current `main` SHA?
2. Which phase and slice is the next incomplete unit?
3. Is there an existing open PR for that unit?
4. Are any earlier PRs unmerged, stale, or conflicting?
5. Did the previous slice merge and pass post-merge verification?
6. Which product constitution and ADR rules constrain this slice?
7. Which schemas, APIs, workers, consoles, migrations, and tests already exist?
8. Which files are authoritative and which are obsolete?
9. What are the explicit acceptance tests for this slice?
10. What new tenant, authorization, prompt-injection, data-loss, and export risks does it introduce?
11. Are required external credentials present? If not, what can still be implemented and tested without them?
12. What is the rollback path?
13. What exact CI jobs must pass?
14. What temporary artifacts must be absent before merge?
15. What documentation and status entries must be updated?

Implementation must not begin until these questions have grounded answers. The agent may resolve them autonomously from the repository and connected tools; it should not ask the user to repeat information already available.

---

## 10. Implementation checklist for every slice

### Plan

- Confirm slice outcome and non-goals.
- Identify changed components.
- Define data migrations and rollback implications.
- Define security boundaries and abuse cases.
- Define tests before or alongside implementation.

### Implement

- Branch from current `main`.
- Add or update ADRs for material decisions.
- Implement smallest complete vertical slice.
- Keep provider, infrastructure, and vendor details behind interfaces where required.
- Preserve immutable identities and provenance.
- Add observability without sensitive content.

### Validate

- Format.
- Strict typecheck.
- Unit tests.
- Integration and adversarial tests.
- Application builds.
- Dependency audit.
- Empty-database migration replay.
- All pgTAP suites.
- Changed-file review.
- Secret scan and temporary-file check.

### Publish

- Make intentional commits.
- Push the branch.
- Open or update the PR.
- Document scope, risk, and validation.
- Fix failures without weakening gates.
- Merge only after all required checks are green.
- Verify the merge in `main`.
- Update status.

---

## 11. Completion report format

After every merged slice, the agent must report:

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

A statement such as “done” without this proof is insufficient.

---

## 12. Status ledger

This ledger must be updated after verified merges. A checked item means the code is merged to `main`, mandatory CI is green, and the merge was verified.

### Phase 5

- [x] 5.1 Deterministic answer kernel
- [ ] 5.2 Immutable generation ledger
- [ ] 5.3 Retrieval and provider-neutral generation runtime
- [ ] 5.4 Draft inspection console and evaluation harness
- [ ] Phase 5 exit review

### Phase 6

- [ ] 6.1 Review domain and immutable human revisions
- [ ] 6.2 Risk-based approvals and invalidation
- [ ] 6.3 Trusted answer library and controlled reuse
- [ ] 6.4 Approved export integration
- [ ] 6.5 Reviewer console completion
- [ ] Phase 6 exit review

### Phase 7

- [ ] 7.1 Security and privacy hardening
- [ ] 7.2 Production evaluation and release governance
- [ ] 7.3 Google Drive integration
- [ ] 7.4 Stripe billing and entitlements
- [ ] 7.5 Production deployment and operations
- [ ] Phase 7 exit review

### Phase 8

- [ ] 8.1 Design-partner beta package
- [ ] 8.2 Product analytics and outcome measurement
- [ ] 8.3 Launch readiness and public release
- [ ] 8.4 Post-launch iteration system
- [ ] Phase 8 exit review

---

## 13. First action after the next `build` command

The agent must first inspect the current state of the Phase 5 immutable-generation-ledger pull request.

- If it is green, correct, current, and contains no temporary artifacts, merge it and verify `main`.
- If it is failing or stale, repair it on its existing branch, rerun all gates, remove temporary artifacts, merge it, and verify `main`.
- If it has been superseded or cannot safely be repaired, close it with an explanation, create a fresh branch from `main`, reimplement Slice 5.2, validate it, and merge it.

Only after Slice 5.2 is verified in `main` may the agent begin Slice 5.3.

---

## 14. Definition of autonomous completion

A phase has been implemented autonomously in one go when the agent, after receiving `build`:

- performs repository discovery without asking the user to restate known context;
- completes every remaining slice in that phase in dependency order;
- makes and pushes intentional commits;
- creates, validates, and merges each slice PR to `main`;
- repairs its own CI failures where possible;
- verifies every merge;
- updates the status ledger;
- provides the completion report; and
- stops only for a real external blocker, safety boundary, unavailable capability, or irrecoverable repository permission failure.

This contract favors truthful, tested, merged progress over optimistic status claims.
