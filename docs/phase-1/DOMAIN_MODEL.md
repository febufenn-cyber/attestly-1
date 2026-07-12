# Canonical Domain Model

## 1. Design objective

The domain model must prevent three dangerous simplifications:

1. treating a document as universally applicable evidence;
2. treating a question as one indivisible fact;
3. treating a previously approved answer as timeless company truth.

The central relationship is:

> A scoped claim is supported by versioned evidence for a specific context and period, then represented in an answer that is reviewed and approved for a questionnaire snapshot.

## 2. Core invariants

- Every customer-owned entity belongs to exactly one tenant.
- Tenant identity is immutable after creation.
- Every material answer claim has provenance or an explicit unsupported/human-assertion state.
- Original uploaded files and original questionnaires are immutable.
- Derived text, chunks, embeddings, answers, and exports are versioned.
- Approval applies to an immutable answer revision and questionnaire snapshot.
- Material edits create a new answer revision and invalidate affected approvals.
- Evidence deletion does not rewrite historical audit events; historical references become tombstoned and access-controlled.
- Superseded evidence is retained for history but excluded from current high-confidence retrieval.
- Scope matching is explicit and never inferred solely from document similarity.

## 3. Tenant and identity entities

### Tenant

Represents an organization workspace.

Fields:

- `id`
- `name`
- `legal_name`
- `status`
- `primary_region`
- `default_retention_policy_id`
- `created_at`
- `deleted_at`

### Membership

Joins a user identity to a tenant.

Fields:

- `id`
- `tenant_id`
- `user_id`
- `role`
- `status`
- `invited_by`
- `joined_at`
- `last_active_at`

A user may hold additional scoped permissions through role grants, but no permission exists without an active membership.

### RoleGrant

Optional object- or scope-specific permission.

Examples:

- reviewer for Product A;
- legal approver for privacy questions;
- viewer restricted from confidential evidence;
- knowledge owner for the EU region.

Fields:

- `id`
- `tenant_id`
- `membership_id`
- `role`
- `scope_expression`
- `valid_from`
- `valid_until`
- `granted_by`

## 4. Scope model

### Scope

Scope is a reusable structured object attached to evidence, claims, historical answers, questionnaire contexts, and approvals.

Fields:

- `tenant_id`
- `legal_entity_ids[]`
- `business_unit_ids[]`
- `product_ids[]`
- `product_version_expression`
- `environment_ids[]`
- `regions[]`
- `deployment_models[]`
- `data_classifications[]`
- `customer_segments[]`
- `effective_from`
- `effective_until`
- `custom_dimensions`

Empty arrays must have explicit semantics. They must not silently mean both “all” and “unknown.” Recommended representation:

- `scope_mode = all` — intentionally universal within the tenant;
- `scope_mode = selected` — applies only to listed values;
- `scope_mode = unknown` — scope has not been established and cannot support high confidence.

### ScopeMatch

A computed record produced during retrieval and answer validation.

Fields:

- `requested_scope_id`
- `candidate_scope_id`
- `dimension_results`
- `overall_result`: `exact`, `compatible`, `partial`, `mismatch`, `unknown`
- `explanation`
- `ruleset_version`

High-confidence support normally requires `exact` or a policy-approved `compatible` match.

## 5. Evidence entities

### EvidenceDocument

Logical identity of a source across versions.

Fields:

- `id`
- `tenant_id`
- `title`
- `source_type`
- `evidence_class`
- `owner_membership_id`
- `confidentiality`
- `external_disclosure_policy`
- `approval_status`
- `scope_id`
- `review_cycle`
- `current_version_id`
- `created_at`
- `retired_at`

`source_type` describes form, such as policy, architecture diagram, audit report, spreadsheet, runbook, or prior questionnaire.

`evidence_class` describes what it can prove: independent attestation, operational proof, implementation documentation, governance evidence, historical representation, or unverified statement.

### EvidenceVersion

Immutable uploaded source version.

Fields:

- `id`
- `tenant_id`
- `evidence_document_id`
- `original_file_id`
- `file_hash`
- `version_label`
- `effective_from`
- `effective_until`
- `review_due_at`
- `approved_by`
- `approved_at`
- `supersedes_version_id`
- `processing_status`
- `extraction_quality`
- `created_at`

### FileObject

Storage metadata for an immutable binary.

Fields:

- `id`
- `tenant_id`
- `storage_provider`
- `storage_key`
- `original_filename`
- `media_type`
- `size_bytes`
- `sha256`
- `malware_scan_status`
- `encryption_context`
- `created_at`

Storage keys must include non-guessable identifiers and must not be accepted directly from client authorization decisions.

### EvidenceSpan

Smallest citable unit.

Fields:

- `id`
- `tenant_id`
- `evidence_version_id`
- `parent_span_id`
- `text`
- `normalized_text`
- `page_number`
- `sheet_name`
- `cell_range`
- `heading_path`
- `paragraph_index`
- `character_start`
- `character_end`
- `extraction_confidence`
- `content_hash`
- `embedding_version`
- `created_at`

A citation points to an EvidenceSpan, not merely to a filename.

### EvidenceRelation

Represents explicit relationships:

- `supersedes`
- `implements`
- `operates_control`
- `attests_to`
- `contradicts`
- `clarifies`
- `derived_from`
- `applies_with`

Fields:

- `id`
- `tenant_id`
- `source_evidence_id`
- `target_evidence_id`
- `relation_type`
- `description`
- `created_by`
- `approved_by`

## 6. Questionnaire entities

### Questionnaire

Logical questionnaire engagement.

Fields:

- `id`
- `tenant_id`
- `name`
- `requesting_customer`
- `customer_context`
- `requested_due_at`
- `target_scope_id`
- `status`
- `current_snapshot_id`
- `created_by`
- `created_at`

### QuestionnaireSource

Immutable imported artifact.

Fields:

- `id`
- `tenant_id`
- `questionnaire_id`
- `file_object_id`
- `format`
- `parser_version`
- `compatibility_report`
- `imported_by`
- `imported_at`

### QuestionnaireSnapshot

Immutable normalized state used for generation, approval, and export.

Fields:

- `id`
- `tenant_id`
- `questionnaire_id`
- `source_id`
- `revision_number`
- `schema_version`
- `status`
- `created_by`
- `created_at`

A final approval is bound to one snapshot.

### QuestionnaireSection

Fields:

- `id`
- `tenant_id`
- `snapshot_id`
- `parent_section_id`
- `title`
- `instructions`
- `source_location`
- `display_order`

### Question

Preserves original wording and file location.

Fields:

- `id`
- `tenant_id`
- `snapshot_id`
- `section_id`
- `parent_question_id`
- `original_text`
- `normalized_text`
- `question_type`
- `required_answer_format`
- `source_location`
- `conditional_expression`
- `requested_evidence_type`
- `risk_hint`
- `display_order`
- `parse_status`

### AtomicClaimRequest

A normalized fact request extracted from a question.

Example source question:

> Is customer data encrypted at rest and in transit, are keys rotated annually, and is key access restricted?

Atomic requests:

1. customer data encryption at rest;
2. customer data encryption in transit;
3. annual key rotation;
4. restricted access to cryptographic keys.

Fields:

- `id`
- `tenant_id`
- `question_id`
- `predicate`
- `subject`
- `object`
- `qualifiers`
- `requested_scope_id`
- `expected_value_type`
- `materiality`
- `display_order`

## 7. Answer entities

### Answer

Logical answer identity for a question.

Fields:

- `id`
- `tenant_id`
- `question_id`
- `current_revision_id`
- `workflow_status`
- `assigned_to`
- `risk_tier`

### AnswerRevision

Immutable answer revision.

Fields:

- `id`
- `tenant_id`
- `answer_id`
- `revision_number`
- `answer_text`
- `principal_state`
- `state_reasons[]`
- `scope_id`
- `generation_run_id`
- `created_by_type`: `model`, `human`, `imported`
- `created_by`
- `change_class`: `generated`, `material`, `formatting_only`
- `change_reason`
- `created_at`

### AnswerClaim

One material claim made in an answer revision.

Fields:

- `id`
- `tenant_id`
- `answer_revision_id`
- `atomic_claim_request_id`
- `claim_text`
- `normalized_claim`
- `support_status`
- `scope_match_result`
- `freshness_result`
- `authority_result`
- `contradiction_result`
- `disclosure_status`

### ClaimCitation

Binds a claim to exact evidence.

Fields:

- `id`
- `tenant_id`
- `answer_claim_id`
- `evidence_span_id`
- `citation_role`: `supports`, `limits`, `contradicts`, `background`
- `directness`: `direct`, `inferential`
- `validator_result`
- `created_at`

A high-confidence affirmative claim requires at least one direct supporting citation unless a constitution-level exception exists.

### HumanAssertion

A scoped statement supplied by an authorized user when source documents are insufficient.

Fields:

- `id`
- `tenant_id`
- `statement`
- `scope_id`
- `asserted_by`
- `approved_by`
- `effective_from`
- `review_due_at`
- `reuse_allowed`
- `supporting_context`

Human assertions remain visibly distinct from documentary evidence.

## 8. Generation entities

### GenerationRun

Captures reproducible generation metadata.

Fields:

- `id`
- `tenant_id`
- `question_id`
- `requested_scope_id`
- `provider`
- `model`
- `model_configuration_hash`
- `system_policy_version`
- `prompt_template_version`
- `retrieval_ruleset_version`
- `output_schema_version`
- `validator_version`
- `retrieved_span_ids[]`
- `token_usage`
- `estimated_cost`
- `started_at`
- `completed_at`
- `status`
- `failure_code`

Raw prompts should not automatically be copied into general logs. Access-controlled diagnostic storage, if enabled, follows retention and minimization policy.

### RetrievalCandidate

Fields:

- `id`
- `tenant_id`
- `generation_run_id`
- `evidence_span_id`
- `keyword_score`
- `semantic_score`
- `scope_match`
- `freshness_score`
- `authority_score`
- `authorization_decision`
- `final_rank`
- `selected_for_context`

Authorization failure must exclude a candidate before content reaches the model.

### ValidationResult

Fields:

- `id`
- `tenant_id`
- `generation_run_id`
- `validator_type`
- `result`
- `severity`
- `details`
- `created_at`

Validators include schema, citation existence, claim alignment, scope, freshness, contradiction, disclosure, and unsafe-content checks.

## 9. Workflow and approval entities

### ReviewTask

Fields:

- `id`
- `tenant_id`
- `questionnaire_id`
- `answer_id`
- `task_type`
- `required_role`
- `assigned_to`
- `status`
- `due_at`
- `created_at`
- `completed_at`

### Approval

Immutable approval of an answer revision or questionnaire snapshot.

Fields:

- `id`
- `tenant_id`
- `target_type`
- `target_id`
- `approval_type`
- `decision`
- `approved_by`
- `scope_id`
- `comment`
- `created_at`
- `invalidated_at`
- `invalidation_reason`

### Comment

Fields:

- `id`
- `tenant_id`
- `target_type`
- `target_id`
- `body`
- `visibility`
- `created_by`
- `created_at`
- `resolved_at`

## 10. Export entities

### ExportJob

Fields:

- `id`
- `tenant_id`
- `questionnaire_snapshot_id`
- `approval_snapshot_hash`
- `exporter_version`
- `requested_by`
- `status`
- `compatibility_report`
- `output_file_id`
- `output_sha256`
- `created_at`
- `completed_at`

### DisclosurePackage

Optional explicit bundle of customer-facing evidence attachments.

Fields:

- `id`
- `tenant_id`
- `questionnaire_snapshot_id`
- `approved_evidence_version_ids[]`
- `redaction_status`
- `approved_by`
- `created_at`

Internal citation use does not automatically authorize external disclosure.

## 11. Audit entity

### AuditEvent

Append-only event.

Fields:

- `id`
- `tenant_id`
- `actor_type`
- `actor_id`
- `action`
- `target_type`
- `target_id`
- `request_id`
- `source_ip_hash_or_policy_approved_value`
- `metadata`
- `previous_record_hash`
- `created_at`

Audit metadata is minimized and must not include secrets or unnecessary full document text.

## 12. Lifecycle state machines

### Evidence version

`uploaded → scanning → extracting → needs_metadata → review → approved → current → superseded/retired/deleted`

Failure states:

`scan_failed`, `extraction_failed`, `unsupported_format`, `quarantined`

Only approved/current evidence is eligible for normal high-confidence retrieval.

### Questionnaire

`imported → parsing → needs_mapping → ready → generating → in_review → awaiting_approval → approved → exported → archived`

Failure/exception states:

`parse_failed`, `generation_partial`, `export_blocked`

### Answer

`unstarted → generated → needs_review → edited → awaiting_approval → approved → reopened`

Principal answer state is separate from workflow state. An answer can be `no_evidence` and still reach an approved workflow state when the approved outward answer truthfully states that the information is unavailable.

## 13. Suggested database constraints

Phase 2 should translate these into database constraints and RLS policies:

- unique `(tenant_id, object_id)` ownership on all customer tables;
- foreign keys include tenant-consistency checks where the database supports them;
- immutable original file hashes and snapshot records;
- approval target must reference an immutable revision/snapshot;
- current-version pointers must reference the same tenant and logical object;
- deleted or superseded evidence cannot be newly selected as current support;
- every claim citation must match the answer claim tenant;
- final export requires an approved snapshot and valid required approvals;
- no service-role access from untrusted clients.

## 14. Example structured answer

```json
{
  "question_id": "q_42",
  "principal_state": "partially_supported",
  "risk_tier": "high",
  "answer_text": "Customer data is encrypted in transit using TLS. Available evidence confirms provider-managed encryption at rest for the production database, but does not establish annual key rotation for all services. Security confirmation is required for the key-rotation portion.",
  "claims": [
    {
      "claim": "Customer data is encrypted in transit using TLS.",
      "support_status": "supported",
      "scope_match": "exact",
      "citations": ["span_tls_architecture_12"]
    },
    {
      "claim": "The production database uses provider-managed encryption at rest.",
      "support_status": "supported",
      "scope_match": "exact",
      "citations": ["span_database_standard_8"]
    },
    {
      "claim": "Keys are rotated annually for all services.",
      "support_status": "no_evidence",
      "scope_match": "unknown",
      "citations": []
    }
  ],
  "required_reviewers": ["security_reviewer"]
}
```
