# Security, Privacy, and Threat Model

## 1. Security objective

Attestly processes sensitive internal security documentation and creates external representations about a company’s controls. The product must protect confidentiality, integrity, availability, provenance, tenant isolation, and approval accountability.

The primary security failure classes are:

1. one tenant’s data reaching another tenant;
2. unauthorized users accessing sensitive evidence;
3. untrusted documents manipulating the agent or tools;
4. unsupported or altered claims being exported as approved truth;
5. sensitive internal details being disclosed beyond customer intent;
6. deletion, retention, logging, or model-provider behavior violating customer expectations.

## 2. Assets

### Highest-sensitivity assets

- internal security policies and procedures;
- architecture and data-flow diagrams;
- audit and penetration-test reports;
- vulnerability and incident information;
- customer and vendor security questionnaires;
- credentials, tokens, secrets, and integration grants;
- personal data contained in evidence;
- answer history and internal reviewer comments;
- legal/privacy review notes;
- tenant membership and authorization data;
- audit logs;
- model inputs and retrieved context;
- final approved exports.

### Integrity-critical assets

- source-file hashes;
- evidence versions and scopes;
- question-to-cell mappings;
- answer revisions;
- claim-to-citation relationships;
- approval records;
- export snapshots and hashes;
- RLS and authorization policies;
- prompt-policy and validator versions.

## 3. Threat actors

- external unauthenticated attacker;
- compromised customer account;
- malicious or careless tenant user;
- malicious administrator;
- insider with infrastructure access;
- attacker controlling an uploaded document or questionnaire;
- compromised integration or OAuth token;
- vulnerable or malicious dependency;
- model-provider or cloud-provider failure;
- accidental developer or support access;
- another tenant attempting cross-tenant discovery;
- automated abuse causing denial of service or excessive cost.

## 4. Trust boundaries

The implementation must produce a data-flow diagram covering these boundaries:

1. browser/mobile client ↔ edge/API;
2. API ↔ authentication service;
3. API/worker ↔ database;
4. API/worker ↔ object storage;
5. ingestion service ↔ file-processing sandbox;
6. retrieval service ↔ keyword/vector indexes;
7. orchestration service ↔ model provider;
8. application ↔ Google Drive or other integrations;
9. application ↔ Stripe;
10. application ↔ analytics/error monitoring;
11. application ↔ email/notification service;
12. application ↔ export service;
13. employee/support tooling ↔ production systems.

For every boundary, Phase 2 must record data classes, authorization, encryption, retention, retries, failure mode, logs, and responsible component.

## 5. Threat scenarios and required controls

### T-001 Cross-tenant database access

**Scenario:** A query, RLS policy, service-role call, or object reference returns Company B data to Company A.

**Impact:** Existential confidentiality breach.

**Controls:**

- tenant ID on every customer-owned record;
- database-level RLS on all exposed tables;
- server-side authorization in addition to RLS;
- no service-role credentials in client applications;
- tenant-consistency constraints on relationships;
- randomized non-enumerable object IDs;
- automated positive and negative isolation tests for every table and endpoint;
- security review for all RLS changes;
- tenant-aware observability and incident containment.

**Launch rule:** Any known or reproducible cross-tenant exposure blocks launch.

### T-002 Cross-tenant retrieval or cache leakage

**Scenario:** Vector search, keyword search, caches, job queues, or model context omit tenant filters.

**Controls:**

- authorization and tenant filtering before ranking;
- per-tenant or cryptographically tenant-bound cache keys;
- tenant ID in jobs and generation runs;
- rejection when job tenant and object tenant differ;
- test fixtures with semantically identical documents across tenants;
- no global vector query followed by application-side filtering;
- red-team tests for ID substitution and cache confusion.

### T-003 Insecure direct object reference

**Scenario:** An authorized user changes an ID in a request and accesses another object or workspace.

**Controls:**

- object lookup always includes active tenant and permission predicates;
- signed short-lived download URLs generated only after authorization;
- deny-by-default authorization middleware;
- no authorization based on object secrecy or UI visibility;
- negative tests for every read/write endpoint.

### T-004 Indirect prompt injection

**Scenario:** A questionnaire, policy, comment, hidden cell, metadata field, prior answer, or retrieved passage instructs the agent to ignore rules, access other data, reveal prompts, or call tools.

**Controls:**

- mark all imported content as untrusted data;
- strict separation between system policy and document content;
- tool calls generated only from trusted orchestration code and validated arguments;
- retrieval cannot widen authorization based on document instructions;
- allowlisted tools with least privilege;
- structured output schemas;
- output validation for secrets, unrelated content, and citation existence;
- adversarial prompt-injection test corpus including hidden spreadsheet content;
- no direct execution of instructions found in source content.

### T-005 Malicious file upload

**Scenario:** Uploaded files exploit parsers, consume resources, contain malware, decompression bombs, external links, active content, or parser-confusion payloads.

**Controls:**

- allowlisted formats and content sniffing;
- file-size, page-count, dimension, archive-depth, and processing-time limits;
- malware/quarantine scanning where available;
- isolated, ephemeral processing environment without customer-network access;
- no macro, script, external-link, or embedded-object execution;
- patched parsing libraries;
- resource quotas and circuit breakers;
- retain failure state without exposing raw parser errors to users.

### T-006 Sensitive evidence over-disclosure

**Scenario:** A valid internal source is quoted or attached to an external customer despite confidentiality restrictions.

**Controls:**

- separate internal-use authority from external disclosure permission;
- evidence confidentiality and disclosure fields;
- default to internal citation display only;
- explicit disclosure-package review;
- redaction workflow;
- export validator for prohibited internal content;
- high-risk approval for penetration tests, incidents, vulnerabilities, diagrams, and contracts.

### T-007 Citation laundering

**Scenario:** The answer cites a document whose text does not actually support the claim.

**Controls:**

- citation to exact spans, not only document names;
- deterministic citation existence and tenant checks;
- claim-to-span alignment validator;
- direct versus inferential citation classification;
- reviewer UI showing claim and highlighted source together;
- launch metrics for unsupported claim and alignment error rates.

### T-008 Stale or poisoned answer reuse

**Scenario:** An incorrect or outdated prior answer becomes institutional memory and is reused repeatedly.

**Controls:**

- historical answers are secondary evidence;
- mandatory scope and freshness checks;
- review dates and evidence dependencies;
- invalidation when evidence is superseded or expires;
- reuse permission and approver identity;
- contradiction search against current evidence;
- provenance shown to reviewers.

### T-009 Authorization escalation

**Scenario:** A contributor becomes an administrator or approves restricted answers through a client-side or API flaw.

**Controls:**

- server-side role checks;
- database policy enforcement;
- privileged action confirmation/recent authentication;
- immutable role-change audit events;
- administrator notifications;
- no self-granting roles;
- separation of duties where configured.

### T-010 Compromised integration

**Scenario:** A Google Drive or other integration token is stolen, over-scoped, or used to import/export unauthorized files.

**Controls:**

- minimum OAuth scopes;
- encrypted token storage;
- token rotation and revocation;
- per-workspace integration binding;
- explicit folder/file selection;
- reauthorization for sensitive changes;
- access logs;
- no use of integration identity outside requested operations.

### T-011 Model-provider data leakage

**Scenario:** More customer data than necessary is sent to a model provider, retained unexpectedly, used for training, or routed to an unapproved region/provider.

**Controls:**

- approved provider configuration per workspace/region;
- contractual and technical no-training settings where required;
- data minimization and excerpt-only context;
- prohibit secrets and unnecessary identifiers in model context;
- configurable provider disablement for restricted tenants;
- record provider/model/region per generation run;
- documented subprocessor and retention posture;
- fail closed rather than silently switching to an unapproved provider.

### T-012 Logging and observability leakage

**Scenario:** Prompts, document text, tokens, personal data, or secrets enter logs, analytics, traces, or error reports.

**Controls:**

- structured logging with allowlisted fields;
- redaction and secret detection;
- no full prompts or source documents in default logs;
- separate access-controlled diagnostic storage when necessary;
- retention limits;
- production access auditing;
- synthetic data in routine debugging.

### T-013 Export corruption or wrong-cell placement

**Scenario:** Correct answers are written to wrong cells, formulas are overwritten, hidden structure changes, or internal content is included.

**Controls:**

- immutable source and confirmed mapping;
- deterministic export plan;
- approved frozen snapshot;
- source/output structural diff;
- reopen and validate output;
- block unexpected changes;
- output hash and audit record;
- manual fallback for unsupported artifacts.

### T-014 Approval bypass or time-of-check/time-of-use failure

**Scenario:** A questionnaire changes after approval or an old approval is applied to a new answer revision.

**Controls:**

- approvals bind to immutable answer revisions and questionnaire snapshots;
- material edit invalidates approval;
- export verifies current snapshot hash and approval set;
- final approver acts on a frozen snapshot;
- no mutable “approved=true” field without target revision.

### T-015 Formula injection in exported CSV/XLSX

**Scenario:** Generated text beginning with `=`, `+`, `-`, or `@` is interpreted as a spreadsheet formula.

**Controls:**

- context-aware output encoding;
- prohibit formula creation in ordinary answer fields;
- validate exported values;
- warn when requested answer format intentionally requires formulas;
- test adversarial values.

### T-016 Denial of service and cost abuse

**Scenario:** Large files, repeated generation, malicious prompts, or many workspaces exhaust CPU, storage, model quota, or budget.

**Controls:**

- per-user and per-workspace rate limits;
- upload and extraction quotas;
- bounded retries;
- idempotency keys;
- generation budgets and concurrency controls;
- anomaly detection;
- job cancellation;
- transparent usage reporting.

### T-017 Supply-chain compromise

**Scenario:** A dependency, package, build action, container, or model SDK is compromised.

**Controls:**

- lockfiles and pinned dependencies;
- dependency scanning and update policy;
- minimal production images;
- signed/reproducible build strategy where practical;
- protected CI secrets;
- branch protection and review requirements;
- software bill of materials target;
- emergency patch and rollback process.

### T-018 Support/admin overreach

**Scenario:** Staff access customer documents unnecessarily or without customer awareness.

**Controls:**

- no standing broad document access;
- just-in-time, time-limited support access;
- customer-approved access where feasible;
- purpose logging and audit trail;
- sensitive-data masking;
- production access review;
- documented break-glass procedure.

## 6. Authentication and session policy

MVP requirements:

- secure provider-managed authentication;
- verified email before active access;
- expiring invitations;
- secure cookie/token handling;
- revocation on membership removal;
- session expiration and refresh controls;
- rate limiting for authentication endpoints;
- multi-factor authentication support prioritized for administrators and enterprise pilots;
- SSO deferred until justified by design partners, but domain model must not prevent it.

## 7. Authorization policy

Authorization decisions consider:

- active tenant;
- membership status;
- base role;
- object ownership and scope;
- confidentiality level;
- disclosure permission;
- assigned task;
- approval authority;
- integration binding;
- retention/deletion state.

The frontend may hide unavailable actions for usability, but security relies on server and database enforcement.

## 8. Encryption and secrets

- TLS for data in transit.
- Provider-supported encryption at rest for database and object storage.
- Secrets stored in managed secret systems, not source control or client bundles.
- OAuth tokens and high-value integration secrets encrypted with restricted service access.
- Key rotation and incident revocation procedures documented before production.
- Signed download links are short-lived, single-purpose where possible, and generated after authorization.

## 9. Data classification

Recommended classes:

- `public`
- `internal`
- `confidential`
- `restricted`

Examples:

- public policy summary → public;
- ordinary internal policy → internal/confidential;
- architecture diagram → confidential;
- penetration test, incident report, secrets, vulnerability detail → restricted.

Classification controls UI visibility, retrieval eligibility, model-provider eligibility, logging, support access, disclosure, and retention.

## 10. Privacy principles

### Customer ownership

Customers retain ownership of uploaded files, extracted text, embeddings, answers, edits, and exports.

### No shared-model training by default

Customer content must not be used to train shared models. Provider configuration and contracts must support the promised behavior.

### Purpose limitation

Data is processed to ingest evidence, draft/review questionnaires, export approved answers, operate the service, secure the service, and meet documented legal obligations.

### Data minimization

Only data required for the immediate operation is sent to processors and model providers.

### Transparency

The product identifies active subprocessors, model providers, major retention periods, and regional processing assumptions.

## 11. Retention policy model

Retention is configurable within product and legal limits, with separate categories:

- original evidence files;
- extracted text and embeddings;
- questionnaire originals;
- answer history;
- exports;
- audit logs;
- operational logs;
- model diagnostic records;
- backups;
- deleted-workspace tombstones.

Initial defaults should be conservative and explicitly documented. Production defaults must not be finalized until legal, security, provider, and design-partner requirements are reviewed.

## 12. Deletion workflow

A tenant deletion request must:

1. verify authority and recent authentication;
2. mark the workspace suspended/pending deletion;
3. stop new processing and revoke integrations;
4. queue deletion of database records, objects, derived text, embeddings, caches, and exports;
5. expire signed links and access tokens;
6. preserve only legally/security-required minimal tombstones and audit facts;
7. remove data from backups according to the documented backup lifecycle;
8. record completion and unresolved processor dependencies;
9. provide confirmation without exposing internal infrastructure details.

Evidence deletion must also remove or invalidate retrieval indexes and mark dependent answers for re-review.

## 13. Regional and subprocessor decision gate

Before production customer data is accepted, Phase 2/launch review must document:

- selected primary region;
- database and storage regions;
- model-provider processing region and retention;
- analytics/error-monitoring region;
- backup region;
- cross-border transfers;
- subprocessor list;
- customer-facing contractual statements;
- whether restricted evidence may be sent to each provider.

No marketing promise about residency may precede technical verification.

## 14. Incident severity examples

### Severity 1

- cross-tenant data access;
- unauthorized public exposure;
- compromised production secrets with customer-data access;
- malicious export or widespread unsupported answer submission;
- material loss of integrity in approvals/audit trail.

### Severity 2

- unauthorized same-tenant restricted-document access;
- significant prompt-injection bypass without confirmed exfiltration;
- corrupted exports affecting multiple customers;
- model-provider policy violation.

### Severity 3

- isolated processing failure;
- non-sensitive metadata leakage;
- degraded availability with workarounds.

An incident response plan, contacts, evidence-preservation rules, and customer-notification decision process are required before general availability.

## 15. Security verification required before beta

- RLS and endpoint authorization tests;
- cross-tenant vector/keyword retrieval tests;
- object-storage access tests;
- prompt-injection test corpus;
- malicious file and parser limit tests;
- export structural-diff tests;
- approval snapshot integrity tests;
- secret/log redaction tests;
- role escalation tests;
- integration token revocation tests;
- dependency and configuration scans;
- manual threat-model review.

## 16. Residual risks

No system can guarantee that customer evidence is true or complete. Attestly reduces but cannot eliminate:

- human approval of false statements;
- inaccurate source documents;
- ambiguity in customer questions;
- provider outages or undisclosed provider behavior;
- novel prompt-injection techniques;
- document-format edge cases;
- legal interpretation risk.

The product must communicate these boundaries and preserve evidence showing how each answer was produced and approved.
