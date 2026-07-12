# MVP Scope and Phase 1 Exit Criteria

## 1. Purpose

This document prevents the initial product from expanding into a broad compliance platform before the evidence-grounded questionnaire loop is reliable.

Phase 1 defines the product. Phase 2 may implement the foundation only within these boundaries unless an approved ADR changes them.

## 2. MVP outcome

A qualified B2B SaaS company can:

1. create a secure workspace;
2. upload and classify approved evidence;
3. import a compatible security questionnaire;
4. confirm question and answer-field mappings;
5. generate evidence-grounded draft answers;
6. inspect exact citations, scope, freshness, contradictions, and uncertainty;
7. edit, assign, review, and approve answers;
8. authorize a final questionnaire snapshot;
9. export approved answers into a structurally validated copy of the source file;
10. inspect an audit trail showing how the result was produced.

## 3. MVP in scope

### Workspace and access

- multi-tenant organization workspaces;
- email-based authentication;
- invitations and membership management;
- base roles and scoped grants required by the review workflow;
- database-level tenant isolation and application authorization;
- audit events for sensitive actions.

### Evidence base

- upload PDF, DOCX, TXT, and selected spreadsheet evidence;
- immutable original storage and hashing;
- extraction with page/section/cell provenance;
- metadata, scope, confidentiality, disclosure permission, authority, effective date, review date, and supersession;
- semantic and keyword retrieval with tenant and authorization filtering;
- evidence viewer with highlighted source spans;
- document retirement and re-review triggers.

### Questionnaire processing

- XLSX and CSV import as primary supported paths;
- clean DOCX after compatibility validation;
- mapping preview and correction;
- original question preservation;
- section and conditional relationship detection;
- compound-question decomposition;
- compatibility report;
- immutable normalized snapshots.

### Answer engine

- retrieval before generation;
- structured answer output;
- atomic claim and citation mapping;
- explanatory answer states;
- multidimensional confidence internals;
- contradiction, freshness, scope, disclosure, and citation validation;
- correct abstention and SME/legal escalation;
- provider/model abstraction;
- generation-run provenance.

### Review and approval

- question list and risk-prioritized review queue;
- answer editor;
- citation/evidence panel;
- comments, assignments, and information requests;
- risk-based approvals;
- material-edit approval invalidation;
- final approval bound to a frozen questionnaire snapshot;
- bulk actions with safety exclusions.

### Export

- XLSX and CSV structure-preserving export for supported fixtures;
- clean DOCX export only after compatibility proof;
- manual answer-table fallback for unsupported files;
- output structural validation;
- immutable output artifact and hash;
- no internal-only metadata in outward exports.

### Operational requirements

- asynchronous jobs with visible progress and failure states;
- usage/cost/latency instrumentation;
- error monitoring with redaction;
- documented retention and deletion;
- controlled beta evaluation and regression tests;
- minimal billing/trial enforcement after the core loop is proven.

## 4. Explicitly out of scope for the MVP

### Compliance-program expansion

- SOC 2 or ISO readiness management;
- automated control monitoring;
- evidence collection from every cloud/SaaS system;
- audit project management;
- certification or attestation;
- policy authoring as proof;
- risk registers and enterprise GRC suite replacement.

### Autonomous external action

- direct submission to buyer portals;
- browser automation using customer credentials;
- autonomous acceptance of contracts or terms;
- automated sending to customers without final human approval.

### Broad document/format support

- guaranteed image-only PDF extraction;
- handwriting recognition;
- arbitrary proprietary questionnaire formats;
- macro execution;
- password cracking or bypass;
- perfect preservation of every legacy Office feature.

### High-assurance deployment features

- on-premises deployment;
- customer-managed cloud account deployment;
- air-gapped operation;
- every global data-residency option;
- government/defence accreditation;
- complex enterprise SSO/SCIM before design-partner need is validated.

### Additional product surfaces

- public trust center;
- vulnerability scanner;
- penetration testing;
- legal advice;
- generic enterprise search/chat across all company documents;
- sales CRM replacement;
- complete RFP/proposal automation unrelated to security evidence.

## 5. Scope-change test

A requested feature remains within the MVP only when all are true:

1. it directly reduces time or risk in the evidence-to-approved-questionnaire loop;
2. it can preserve tenant isolation, provenance, and approval rules;
3. it has a real design-partner use case;
4. it does not require a new regulated deployment class;
5. it can be evaluated with explicit acceptance criteria;
6. it does not delay the first end-to-end pilot disproportionately.

Otherwise, record it in the post-MVP backlog.

## 6. Design-partner validation plan

Phase 1 implementation includes the validation protocol, but real interviews and pilots remain external execution tasks.

### Recruit 3–5 companies matching the ICP

Required evidence of fit:

- several questionnaires per month or a clear sales bottleneck;
- existing policies and past approved answers;
- a named daily user and security approver;
- willingness to use a real or recent questionnaire;
- willingness to discuss data-processing and purchasing constraints.

### Discovery artifacts to collect

- last three representative questionnaires;
- source format and complexity;
- people and departments involved;
- elapsed completion time and active reviewer time;
- answer sources used;
- approval process;
- repeated/duplicate-answer frequency;
- common uncertainty and escalation categories;
- examples of wrong, stale, or inconsistent answers;
- security requirements Attestly itself must satisfy;
- unacceptable model-provider/data-processing conditions;
- purchasing owner, budget, and decision process.

### Interview questions

Ask for demonstrated behavior, not hypothetical enthusiasm:

1. Show the last questionnaire you completed.
2. Which questions took the longest and why?
3. Where did each answer come from?
4. Which answers needed engineering, security, legal, HR, or privacy review?
5. Which claims would you never allow AI to answer automatically?
6. What evidence is too sensitive to send to a third-party model?
7. Did a questionnaire delay or threaten a deal?
8. How do you discover that an old approved answer is no longer true?
9. How do you preserve workbook formatting and portal-specific instructions?
10. What proof would justify paying for the product?
11. Who would approve purchase, and what security review must Attestly pass?
12. Will you provide one real questionnaire and reviewer time for a controlled pilot?

### Strong validation signal

A company provides real sanitized data, names a reviewer, allocates pilot time, has an upcoming questionnaire, and agrees to a paid pilot or a concrete conversion condition.

### Weak validation signal

A company says the concept is interesting but will not provide artifacts, reviewer time, security requirements, or a buying process.

## 7. Phase 1 deliverable checklist

- [x] Product definition and non-promise
- [x] Initial ICP and excluded customer profile
- [x] User roles and jobs to be done
- [x] End-to-end workflow
- [x] Functional and non-functional requirements
- [x] Product constitution
- [x] Evidence hierarchy and answer states
- [x] Canonical scope and domain model
- [x] Questionnaire/import/export specification
- [x] Security/privacy threat model
- [x] Permission and approval matrix
- [x] Audit event requirements
- [x] Evaluation corpus specification
- [x] Controlled-beta and GA launch gates
- [x] MVP in-scope and out-of-scope register
- [x] Initial architecture decision records
- [ ] Design-partner interviews completed
- [ ] Representative customer artifacts obtained under appropriate authorization
- [ ] Hosting/model-provider regional and contractual choices approved for production data

The unchecked items require real-world inputs and cannot honestly be completed from repository design work alone.

## 8. Phase 1 exit gate for Phase 2 engineering

Phase 2 may begin because the product, data, safety, workflow, and quality contracts are defined. Before production data or an external beta is accepted, the remaining validation items must be completed.

Engineering may proceed when it can answer these questions from the committed documents:

1. Who is the first customer and who is excluded?
2. What exact workflow is being built?
3. What counts as evidence and what does each evidence class prove?
4. What scope dimensions are part of truth?
5. When may the system make an affirmative claim?
6. When must it abstain, escalate, or qualify?
7. How are contradictions handled?
8. How are compound questions represented?
9. Which formats are supported and how is export validated?
10. Who may read, edit, approve, disclose, and export?
11. Which edits invalidate approval?
12. How are untrusted document instructions contained?
13. How is cross-tenant leakage prevented and tested?
14. What customer data may reach each provider?
15. How are retention and deletion handled?
16. What metrics and absolute safety gates block launch?
17. What is explicitly not being built?

## 9. Phase 2 handoff backlog

The first implementation phase should translate this specification into:

- repository/application scaffold;
- environment strategy;
- Supabase schema and migrations;
- RLS policies and isolation tests;
- authentication and workspace flows;
- object-storage structure and upload policy;
- evidence ingestion job state machine;
- canonical TypeScript schemas;
- audit event service;
- model-provider interface;
- baseline evaluation harness;
- CI checks and deployment pipeline;
- architecture diagram and operational runbooks.

The first Phase 2 milestone should demonstrate tenant isolation and immutable object ownership before implementing full AI generation.

## 10. Definition of Phase 1 “implemented”

Phase 1 is implemented in the repository when:

- all governing documents are version-controlled and cross-linked;
- architecture decisions are recorded;
- requirements use stable identifiers where needed;
- safety and launch blockers are explicit;
- the README directs contributors to the specification;
- a pull request exposes the complete change for review;
- unresolved real-world validation tasks are stated honestly rather than marked complete.
