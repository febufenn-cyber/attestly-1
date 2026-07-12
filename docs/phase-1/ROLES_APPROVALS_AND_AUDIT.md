# Roles, Approvals, and Audit Controls

## 1. Objective

Attestly accelerates review without obscuring who supplied, changed, validated, approved, and exported each representation. Authorization controls access; approval controls accountability. They are related but not interchangeable.

## 2. Base roles

### Workspace administrator

Can:

- configure workspace settings;
- invite, suspend, and remove members;
- assign base roles within policy;
- configure integrations, retention, and billing;
- view administrative and security audit events;
- initiate workspace deletion.

Cannot by role alone:

- approve technical or legal claims;
- read all restricted evidence without an additional grant;
- bypass required approvals;
- alter immutable audit events.

### Knowledge owner

Can:

- upload and classify evidence;
- set evidence scope and review dates;
- approve evidence for retrieval if granted appropriate authority;
- supersede or retire evidence;
- resolve extraction and metadata issues;
- respond to evidence clarification tasks.

Cannot:

- make an unverified document high-authority merely by uploading it;
- approve restricted disclosure without disclosure authority;
- erase historical provenance.

### Contributor

Can:

- create/import questionnaires;
- correct mappings;
- generate drafts;
- edit answers;
- comment and assign tasks;
- request subject-matter information;
- submit answers for review.

Cannot:

- final-export a questionnaire unless separately granted final-approver authority;
- satisfy independent review requirements with their own edit;
- override blocked states without an authorized waiver.

### Security reviewer

Can:

- review security and technical claims within granted scope;
- accept, edit, reject, or reopen answers;
- resolve technical contradictions with recorded rationale;
- approve medium/high technical claims;
- require additional evidence.

### Legal/privacy reviewer

Can:

- review legal, privacy, regulatory, contractual, residency, breach, audit-right, and liability-sensitive language;
- require wording changes or external counsel;
- approve or reject external disclosure of sensitive material within policy.

### Final approver

Can:

- approve an immutable questionnaire snapshot for external export;
- waive specified non-critical warnings where policy permits and rationale is recorded;
- reject or reopen the snapshot.

The final approver cannot waive tenant isolation, fabricated citations, unresolved critical contradictions, missing required approvals, or export integrity failures.

### Viewer/auditor

Can:

- inspect permitted questionnaires, evidence metadata, answer provenance, approvals, and audit events;
- export audit reports where permitted.

Cannot modify product records.

### Support operator

Not a tenant role. Internal support access must be just-in-time, purpose-bound, audited, time-limited, and customer-approved where feasible.

## 3. Permission dimensions

Permissions may be constrained by:

- tenant;
- product/service;
- legal entity;
- environment;
- region;
- question category;
- evidence confidentiality;
- external disclosure permission;
- questionnaire engagement;
- validity period.

A base role grants no access outside an active tenant membership.

## 4. Suggested permission actions

### Workspace

- `workspace.read`
- `workspace.configure`
- `workspace.delete`
- `membership.invite`
- `membership.manage`
- `role.grant`
- `audit.read`

### Evidence

- `evidence.upload`
- `evidence.read_metadata`
- `evidence.read_content`
- `evidence.classify`
- `evidence.approve`
- `evidence.supersede`
- `evidence.retire`
- `evidence.delete`
- `evidence.disclose`

### Questionnaire

- `questionnaire.create`
- `questionnaire.import`
- `questionnaire.map`
- `questionnaire.read`
- `questionnaire.generate`
- `questionnaire.assign`
- `questionnaire.archive`

### Answers

- `answer.read`
- `answer.edit`
- `answer.comment`
- `answer.submit_review`
- `answer.approve_security`
- `answer.approve_legal`
- `answer.waive_warning`
- `answer.reopen`

### Export

- `export.preview`
- `export.final_approve`
- `export.create`
- `export.download`
- `export.disclosure_package`

### Integrations

- `integration.connect`
- `integration.use`
- `integration.revoke`

## 5. Evidence approval versus answer approval

Evidence approval states that a source is authorized for use within a specified scope and period. It does not approve every interpretation of that source.

Answer approval states that a specific immutable answer revision is acceptable for a defined questionnaire context.

Final questionnaire approval states that the complete immutable snapshot is authorized for export.

These approvals must remain separate.

## 6. Risk-tier classification

### Tier 0 — Public/administrative

Examples:

- company name;
- public website;
- published certification name;
- ordinary contact information.

Default review: contributor, subject to evidence and disclosure rules.

### Tier 1 — Standard security governance

Examples:

- existence of policies;
- ordinary training requirements;
- vulnerability-management process;
- standard access-control descriptions.

Default review: contributor plus security reviewer when generated or materially changed.

### Tier 2 — Material technical or privacy claim

Examples:

- encryption guarantees;
- backup and recovery commitments;
- key management;
- logging coverage;
- data retention/deletion;
- subprocessors;
- data location;
- incident-response timelines;
- privileged access.

Default review: security reviewer; privacy/legal reviewer where relevant.

### Tier 3 — High-liability or sensitive representation

Examples:

- breach/incident history;
- absence of vulnerabilities;
- contractual warranties;
- unrestricted audit rights;
- regulatory declarations;
- guaranteed recovery objectives;
- customer-specific data-residency commitments;
- statements about lawfulness or regulatory compliance;
- disclosure of penetration tests, incidents, vulnerabilities, diagrams, or contracts.

Default review: security plus legal/privacy plus final approver. Separation of duties is required.

## 7. Answer-state review requirements

| Principal state | Minimum workflow |
|---|---|
| `supported` | Risk-tier approval rules apply |
| `partially_supported` | Contributor may edit; reviewer must confirm final wording and unsupported portions |
| `historically_supported` | Knowledge owner or reviewer must refresh evidence before affirmative reuse, or approve qualified wording |
| `scope_mismatch` | Correct scope/evidence or explicitly qualify answer; cannot bulk approve |
| `contradicted` | Knowledge owner and appropriate reviewer resolve; cannot final export unresolved if material |
| `no_evidence` | SME task, truthful unknown/negative answer, or documented N/A; cannot become affirmative without new support |
| `requires_sme` | Assigned SME/human assertion plus required review |
| `requires_legal` | Legal/privacy approval required |
| `not_applicable` | Justification and reviewer approval based on risk tier |
| `ambiguous_question` | Clarification or documented interpretation required |
| `blocked_from_automation` | Human-only handling and required approvals |

## 8. Approval lifecycle

1. An AnswerRevision is created.
2. Validators calculate support, state, and risk.
3. Required ReviewTasks are generated.
4. Reviewers act on that exact revision.
5. All required answer approvals are completed.
6. The questionnaire snapshot is frozen.
7. Final approver reviews summary and blockers.
8. A FinalApproval is attached to the snapshot hash.
9. Export verifies the frozen snapshot and approval set.
10. A material answer or mapping change creates a new snapshot/revision and invalidates affected approvals.

## 9. Material versus formatting-only edits

### Material edits

Any change that alters:

- factual meaning;
- scope;
- qualifier;
- commitment strength;
- date, number, percentage, or frequency;
- yes/no meaning;
- evidence or citation;
- legal effect;
- disclosure content;
- remediation timeline.

Material edits invalidate applicable approval.

### Formatting-only edits

Examples:

- whitespace;
- allowed punctuation correction;
- capitalization;
- formatting required by the questionnaire without changing meaning.

Formatting-only classification must be deterministic where possible and auditable. When uncertain, treat as material.

## 10. Bulk actions

Bulk operations may improve efficiency but cannot hide risk.

Bulk approval is prohibited for:

- Tier 3 answers;
- `contradicted`;
- `no_evidence` with an affirmative outward answer;
- `scope_mismatch`;
- `requires_legal`;
- `blocked_from_automation`;
- answers materially edited since last review;
- answers whose evidence expired or was superseded;
- disclosure packages.

Bulk actions must show selection criteria, count, exclusions, actor, and resulting audit event.

## 11. Waivers

A waiver is not an ordinary approval. It records acceptance of a defined residual issue.

Every waiver includes:

- exact warning or requirement waived;
- target revision/snapshot;
- authorized actor;
- rationale;
- expiration or one-time scope;
- risk tier;
- related evidence and reviewers.

Never waivable:

- cross-tenant isolation failures;
- fabricated/nonexistent citations;
- unauthorized evidence access;
- corrupted export with unknown changes;
- absent required identity/tenant checks;
- active malware/quarantine failure;
- lack of final approver;
- mismatch between approved snapshot and exported snapshot.

## 12. Audit events

Audit events are append-only and record at least actor, tenant, action, target, timestamp, request ID, and policy-approved metadata.

### Identity and administration

- login, logout, authentication failure where appropriate;
- invite created/accepted/expired;
- membership suspended/removed;
- role or scoped grant added/removed;
- workspace settings changed;
- retention or residency configuration changed;
- deletion requested/completed.

### Evidence

- upload initiated/completed/failed;
- scan/quarantine result;
- extraction completed/failed;
- metadata/scope changed;
- evidence approved;
- evidence superseded/retired/deleted;
- restricted evidence viewed/downloaded;
- disclosure permission changed.

### Questionnaire

- source imported;
- compatibility report created;
- mapping changed/confirmed;
- snapshot frozen;
- questionnaire archived/deleted.

### Generation and answers

- generation started/completed/failed;
- model/provider/policy/validator versions used;
- answer revision created;
- answer edited/rejected/reopened;
- citation added/removed;
- contradiction resolved;
- task assigned/completed;
- answer approval granted/denied/invalidated;
- waiver created.

### Export

- preview created;
- final approval granted/denied/invalidated;
- export started/completed/blocked;
- output downloaded/shared where measurable;
- disclosure package created/approved.

### Integrations and support

- integration connected/used/revoked;
- token failure or scope change;
- support access requested/approved/started/ended;
- break-glass access.

## 13. Audit content minimization

Do not store by default:

- full document text;
- full prompts;
- secrets or tokens;
- raw authentication credentials;
- unnecessary personal data;
- hidden model reasoning.

Use IDs, hashes, classifications, version references, structured reasons, and access-controlled diagnostics.

## 14. Audit integrity and access

- audit records are append-only to ordinary application roles;
- corrections create new events rather than modifying history;
- audit access is itself audited;
- exportable audit reports are permission-controlled;
- retention meets security and contractual requirements;
- high-value event chains should support tamper-evidence through hashes or protected logging infrastructure;
- time sources are consistent and UTC-based.

## 15. Separation-of-duties defaults

For early pilots, one person may hold multiple operational roles, but Tier 3 final approval should require at least two distinct identities whenever the workspace has sufficient staff:

1. one domain reviewer (security or legal/privacy);
2. one final approver.

A user must not silently approve their own material change when an independent reviewer is configured.

## 16. Review queue requirements

The review interface must support filters for:

- answer state;
- risk tier;
- required reviewer;
- missing evidence;
- evidence expiry;
- contradiction;
- scope mismatch;
- disclosure sensitivity;
- material edits;
- due date;
- unanswered conditional children;
- export blockers.

The UI should prioritize highest-risk blockers, not merely question order.

## 17. Approval summary before final export

The final approver sees:

- total questions and answer-state distribution;
- unresolved or waived warnings;
- Tier 2/Tier 3 list;
- contradictions and scope mismatches;
- human assertions;
- evidence expiring soon;
- material edits after generation;
- disclosure attachments;
- export compatibility status;
- required approvals and identities;
- frozen snapshot hash.

Approval must be an explicit action, not a side effect of downloading.
