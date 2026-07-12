# Product Requirements Document

## 1. Product definition

Attestly is a multi-tenant SaaS application that drafts, reviews, approves, and exports answers to B2B security questionnaires using a customer-controlled evidence base.

The MVP must help a reviewer move from an imported questionnaire to an approved, evidence-linked export while making unsupported, stale, contradictory, or out-of-scope claims visible.

### Product promise

> Upload approved company evidence, import a security questionnaire, receive defensible draft answers with exact supporting sources, and review every uncertain or high-risk claim before export.

### Product non-promise

Attestly does not certify compliance, guarantee that a company control operates effectively, provide legal advice, or autonomously submit representations to a customer.

## 2. Initial ideal customer profile

The first customer segment is a B2B SaaS company that:

- has approximately 20–300 employees;
- sells to US or international mid-market or enterprise buyers;
- receives multiple security questionnaires per month;
- has existing policies, architecture documents, control evidence, and past approved questionnaires;
- lacks a large dedicated GRC team;
- experiences sales delays because security, engineering, legal, or sales engineering must repeatedly reconstruct answers;
- primarily receives XLSX, CSV, or clean DOCX questionnaires.

### Initial exclusion profile

The MVP is not designed for:

- companies with no meaningful evidence base;
- high-assurance government, defence, banking, or clinical deployments requiring specialized hosting or accreditation;
- buyers requiring autonomous browser-based portal submission;
- engagements where Attestly is expected to invent controls or policies and then treat them as proof;
- questionnaires whose principal purpose is contract negotiation rather than security fact collection.

## 3. Users and jobs to be done

### Workspace administrator

- Create and configure an organization workspace.
- Invite and remove users.
- Configure integrations, retention, regional settings, and billing.
- View security and audit events.

### Knowledge owner

- Upload and classify evidence.
- Confirm document scope, authority, validity, and supersession.
- Resolve extraction failures.
- Retire stale evidence.

### Contributor

- Import questionnaires.
- Review and edit generated answers.
- Request information from subject-matter experts.
- Prepare a questionnaire for approval.

### Security reviewer

- Validate security and technical claims.
- Resolve contradictions and unsupported claims.
- Approve medium- and high-risk answers within assigned scope.

### Legal/privacy reviewer

- Review commitments involving contracts, regulatory statements, privacy, data residency, breach history, audit rights, or liability-sensitive language.

### Final approver

- Confirm all required approvals are complete.
- Authorize a final export.
- Accept accountability for the external representation.

### Auditor/viewer

- Inspect evidence provenance, changes, approvals, and exports without changing records.

## 4. Core user journey

1. An administrator creates a workspace and invites users.
2. A knowledge owner uploads approved evidence and supplies required metadata.
3. Attestly extracts text, detects structure, creates versioned evidence spans, and indexes only records visible to that tenant and user.
4. A contributor imports an XLSX, CSV, or supported DOCX questionnaire.
5. Attestly identifies instructions, sections, questions, answer fields, conditional logic, and requested attachments.
6. The system decomposes compound questions into atomic claims where required.
7. For each claim, Attestly retrieves current in-scope evidence, checks for conflicts, and drafts an answer or abstains.
8. The reviewer sees the original question, draft, answer state, citations, evidence strength, scope, freshness, contradictions, and required approver.
9. Users edit, comment, assign, approve, or reject answers. Every material action is audited.
10. A final approver authorizes export.
11. Attestly writes approved answers back into a copy of the original questionnaire without silently changing unrelated structure.
12. The exported artifact, answer snapshot, evidence references, and approval state are retained according to workspace policy.

## 5. Functional requirements

### 5.1 Workspace and tenancy

- FR-TEN-001: Every persistent customer-owned object must have an immutable tenant identifier.
- FR-TEN-002: Access must be enforced server-side and in the database; client filtering is never sufficient.
- FR-TEN-003: A user may belong to multiple workspaces but must explicitly select the active workspace.
- FR-TEN-004: Cross-tenant search, retrieval, caching, logging, exports, and model context are prohibited.
- FR-TEN-005: Workspace deletion must trigger the documented deletion workflow.

### 5.2 Authentication and authorization

- FR-AUTH-001: The MVP supports secure email-based authentication and may add SSO later.
- FR-AUTH-002: Roles and object-level restrictions are evaluated on every write and sensitive read.
- FR-AUTH-003: Privileged operations require recent authentication where supported.
- FR-AUTH-004: Invitations expire and are bound to the intended workspace.

### 5.3 Evidence ingestion

- FR-EVD-001: Upload PDF, DOCX, TXT, and supported spreadsheet evidence.
- FR-EVD-002: Store the immutable original file hash and a versioned extracted representation.
- FR-EVD-003: Require title, owner, source type, approval state, scope, effective date, review date, and confidentiality classification before evidence can produce a high-confidence answer.
- FR-EVD-004: Distinguish policy, implementation, operational, independent-attestation, historical-answer, and unverified evidence.
- FR-EVD-005: Preserve page, sheet, cell, heading, paragraph, and character-offset provenance where technically possible.
- FR-EVD-006: Mark extraction confidence and block unsupported formats or failed extraction from automatic use.
- FR-EVD-007: Support supersession without erasing historical versions.
- FR-EVD-008: Allow a knowledge owner to retire, restrict, or delete evidence.
- FR-EVD-009: Treat document content as untrusted data and isolate it from system instructions.

### 5.4 Evidence retrieval

- FR-RET-001: Retrieval must always include tenant and authorization filters before semantic or keyword ranking.
- FR-RET-002: Retrieval must consider scope, date validity, evidence authority, confidentiality, and document status.
- FR-RET-003: The system must return the exact supporting spans used for each material claim.
- FR-RET-004: Contradictory relevant evidence must be surfaced, not rank-suppressed into invisibility.
- FR-RET-005: Historical approved answers are secondary evidence and must point to primary evidence when available.

### 5.5 Questionnaire import

- FR-QUE-001: Import XLSX and CSV in the MVP; support clean DOCX after format validation.
- FR-QUE-002: Preserve an immutable original questionnaire file.
- FR-QUE-003: Identify sheets, sections, questions, answer fields, instructions, requested evidence, and conditional child questions.
- FR-QUE-004: Preserve original coordinates and formatting metadata needed for export.
- FR-QUE-005: Detect hidden rows, hidden columns, hidden sheets, formulas, merged cells, comments, validations, and macros and display a compatibility report.
- FR-QUE-006: Never execute workbook macros or external links.
- FR-QUE-007: Allow a user to correct parsing before answer generation.
- FR-QUE-008: Decompose compound questions into atomic claims while preserving a single outward-facing answer.

### 5.6 Answer generation

- FR-ANS-001: Evidence retrieval and validation occur before prose generation.
- FR-ANS-002: Every material generated claim must map to one or more evidence spans or be visibly marked as human-provided and unsupported.
- FR-ANS-003: The model must preserve qualifiers, limitations, dates, and scope found in evidence.
- FR-ANS-004: The system must not infer a company practice solely from common industry practice.
- FR-ANS-005: The system must separate the current supported answer from recommendations or remediation suggestions.
- FR-ANS-006: A contradiction, missing evidence, scope mismatch, or expired source must change the answer state and review requirement.
- FR-ANS-007: Model output is structured and schema-validated before storage.
- FR-ANS-008: Model names and providers are configuration, not business logic.
- FR-ANS-009: Prompt, model, retrieval set, output, and validation versions are auditable for each generation run, excluding secrets and unnecessary sensitive content.

### 5.7 Review and collaboration

- FR-REV-001: Display original question, generated answer, atomic claims, citations, evidence metadata, answer state, risk tier, and required approver together.
- FR-REV-002: Support accept, edit, reject, comment, assign, request-information, approve, and reopen actions.
- FR-REV-003: Material edits invalidate prior approval unless the edit is classified as formatting-only.
- FR-REV-004: A user cannot satisfy a required independent approval with the same identity where separation of duties is configured.
- FR-REV-005: Evidence expiration or supersession can mark dependent approved answers for re-review.
- FR-REV-006: Bulk approval excludes high-risk, contradicted, unsupported, and legally sensitive answers.

### 5.8 Export

- FR-EXP-001: Export only from an approved questionnaire snapshot.
- FR-EXP-002: Write answers into a copy of the original file.
- FR-EXP-003: Preserve unrelated sheets, formulas, formatting, validation, comments, and ordering when safe and technically supported.
- FR-EXP-004: Never overwrite the source artifact.
- FR-EXP-005: Produce an export compatibility report listing any unsupported or changed workbook features.
- FR-EXP-006: Keep internal-only citations, reviewer comments, prompts, and confidence internals out of customer-facing files unless explicitly selected.
- FR-EXP-007: Log exporter identity, file hash, questionnaire snapshot, approvals, and timestamp.

### 5.9 Audit and governance

- FR-AUD-001: Record immutable audit events for sensitive reads, document lifecycle changes, answer changes, approvals, exports, role changes, integrations, and deletion operations.
- FR-AUD-002: Audit records include actor, tenant, action, target, time, source context, and before/after references where appropriate.
- FR-AUD-003: Audit logs must not contain secrets, full model prompts by default, or unnecessary document content.
- FR-AUD-004: High-risk actions are visible to workspace administrators.

## 6. Non-functional requirements

### Security

- NFR-SEC-001: A cross-tenant data exposure is a severity-one incident and launch blocker.
- NFR-SEC-002: Sensitive data is encrypted in transit and at rest using provider-supported controls.
- NFR-SEC-003: Secrets are stored outside source control and rotated through documented procedures.
- NFR-SEC-004: Uploads are type-checked, size-limited, malware-scanned where supported, and processed in isolated workers.
- NFR-SEC-005: Logs and observability systems receive minimized and redacted content.

### Reliability

- NFR-REL-001: Import, extraction, generation, and export are idempotent or safely retryable.
- NFR-REL-002: Long-running operations expose explicit state, failure reason, and retry controls.
- NFR-REL-003: No failed generation may silently replace an approved answer.

### Performance

- NFR-PERF-001: Common workspace and questionnaire views should become interactive within two seconds under normal MVP load, excluding large-file processing.
- NFR-PERF-002: Answer generation is asynchronous and streams or reports progress without blocking review of completed items.
- NFR-PERF-003: Retrieval latency and model cost are measured per question.

### Accessibility and usability

- NFR-UX-001: Core workflows are keyboard accessible.
- NFR-UX-002: Status is not communicated by color alone.
- NFR-UX-003: Evidence and uncertainty are understandable without requiring users to interpret raw model scores.

## 7. Product metrics

### North-star operational metric

**Median reviewer minutes saved per completed questionnaire, subject to quality gates.**

Time savings never compensate for an increased unsupported-claim rate.

### Quality metrics

- reviewer-accepted answer rate without material factual correction;
- unsupported affirmative claim rate;
- correct abstention rate;
- claim-to-citation alignment;
- exact-scope retrieval rate;
- stale-answer reuse prevention rate;
- contradiction detection rate;
- export fidelity rate;
- tenant-isolation test pass rate.

### Business metrics

- time to first completed questionnaire;
- design partner activation;
- questionnaires completed per workspace;
- conversion from trial to paid;
- retained monthly active workspaces;
- gross model and processing cost per questionnaire.

## 8. MVP commercial hypothesis

- Acquisition wedge: one limited questionnaire trial using a bounded evidence corpus.
- Initial pricing experiment: per-questionnaire, with a seat/usage subscription tested after repeat use is demonstrated.
- Value proof: measured reviewer time saved, faster sales-security turnaround, and fewer unsupported or inconsistent answers.

Pricing is not considered validated until at least three design partners use Attestly on a real questionnaire and at least one agrees to pay or signs a concrete pilot agreement.

## 9. Dependencies and assumptions

- Customers can provide sufficiently authoritative and current evidence.
- The first production region and model-provider data terms are approved before production use.
- Real questionnaires are available for import/export testing.
- Human reviewers remain accountable for external representations.
- Phase 2 implements database-level row-level security and testable tenant boundaries before feature expansion.
