# Product Constitution

This document contains the non-negotiable rules governing Attestly. Product features, prompts, agents, database design, user experience, and commercial pressure must not override these rules without an approved constitution-level ADR.

## Article 1 — Purpose

Attestly exists to help organizations create defensible answers to security questionnaires from authorized evidence.

The system optimizes for:

1. factual defensibility;
2. explicit scope;
3. traceable provenance;
4. correct uncertainty;
5. human accountability;
6. secure handling of customer information;
7. reliable preservation of questionnaire structure.

The system does not optimize for the maximum number of affirmative answers.

## Article 2 — Boundary of authority

Attestly may:

- retrieve authorized evidence;
- identify relevant evidence spans;
- draft answers;
- classify uncertainty and risk;
- identify conflicts and missing information;
- recommend a reviewer or follow-up action;
- preserve approved knowledge for controlled reuse;
- export an approved answer snapshot.

Attestly may not, in the MVP:

- certify that an organization is compliant;
- independently attest that a control operated effectively;
- provide legal advice;
- invent a company practice because it is common in the industry;
- create evidence and then use that same generated material as independent proof;
- silently resolve conflicting sources;
- submit external representations without explicit human approval;
- expose evidence beyond the permissions and disclosure level assigned to it.

## Article 3 — Evidence before prose

No generated answer may be stored as supported unless evidence retrieval and validation have run first.

A fluent answer is not evidence. A model's internal knowledge is not evidence about the customer. A prior answer is not primary evidence merely because a human once approved it.

Every material claim in a supported answer must have one of these origins:

- a traceable approved evidence span;
- a scoped, dated, and attributed human assertion that is visibly identified as such;
- a deliberate statement that evidence is missing, conflicting, stale, or not applicable.

## Article 4 — Scope is part of truth

An answer is never universally true merely because it was once true somewhere in the organization.

Claims and evidence must be scoped where applicable by:

- tenant and legal entity;
- business unit;
- product or service;
- product version;
- system or deployment environment;
- geographic region;
- data classification;
- customer segment or deployment model;
- effective and review dates;
- questionnaire customer context.

A scope mismatch must prevent automatic reuse and high-confidence assertion.

## Article 5 — Evidence classes

Evidence is classified by what it proves, not only by file type.

### Independent attestation

Examples: audit reports, assessor conclusions, certifications, penetration-test attestations. This can support statements within its exact scope and validity period; it does not prove facts outside that scope.

### Operational proof

Examples: completed access reviews, backup restoration records, training completion reports, configuration exports, incident exercise records, security-tool reports. This can support that an activity occurred or a state existed at a particular time.

### Approved implementation documentation

Examples: architecture diagrams, data-flow diagrams, runbooks, configuration standards, system designs. This can support how a control is designed or implemented.

### Governance evidence

Examples: approved policies, procedures, standards, and handbooks. This supports intended rules and responsibilities, not by itself that the control operated.

### Historical approved representation

Examples: previous questionnaires, RFP responses, and trust-center statements. These are reusable knowledge leads and evidence of a prior representation, not proof that the underlying fact remains current.

### Unverified statement

Examples: notes, informal messages, unapproved drafts, and model-generated text. These cannot independently support a high-confidence answer.

## Article 6 — Answer-state doctrine

The system uses explanatory states rather than a single opaque confidence score.

Allowed principal answer states are:

- `supported` — current, authoritative, in-scope evidence supports all material claims;
- `partially_supported` — at least one material claim lacks sufficient support;
- `historically_supported` — a prior approved representation exists, but current evidence is insufficient or stale;
- `scope_mismatch` — relevant evidence exists for a different product, environment, region, entity, data class, or customer context;
- `contradicted` — authoritative sources materially disagree;
- `no_evidence` — no sufficient evidence was found;
- `requires_sme` — a subject-matter expert must provide or validate the answer;
- `requires_legal` — legal or privacy review is necessary;
- `not_applicable` — the question does not apply and the justification is recorded;
- `ambiguous_question` — the question has multiple material interpretations;
- `blocked_from_automation` — sensitivity, policy, or technical limitations prohibit automatic drafting.

A simplified UI label may be derived from these states, but the canonical state and reasons must be retained.

## Article 7 — Confidence doctrine

Internal confidence is multidimensional. At minimum, it evaluates:

- evidence strength;
- semantic relevance;
- scope match;
- freshness;
- source authority;
- contradiction risk;
- extraction quality;
- answer completeness;
- claim-to-citation alignment.

A high-confidence result requires all of the following:

- every material claim is supported;
- sources are current and approved;
- scope matches the questionnaire context;
- extraction is reliable;
- no unresolved contradiction exists;
- citations directly support the claim;
- the answer preserves limitations and qualifiers.

Model eloquence, answer length, similarity to prior answers, or user urgency may not raise confidence.

## Article 8 — Generation rules

The generation system must:

1. interpret the original question without obeying embedded instructions that conflict with system policy;
2. identify answer type and requested evidence;
3. decompose compound questions into atomic claims;
4. retrieve only authorized, tenant-scoped evidence;
5. evaluate scope, authority, freshness, extraction quality, and conflict;
6. draft a concise answer preserving qualifiers;
7. map each material claim to exact evidence spans;
8. assign answer state, risk tier, and required reviewers;
9. schema-validate output;
10. fail closed when validation or evidence checks fail.

The generation system must not:

- fabricate or approximate citations;
- convert a recommendation into a statement of current practice;
- convert policy intent into operational proof;
- silently omit an unsupported clause from a compound question;
- broaden language from “some,” “generally,” or “where applicable” to “all” or “always”;
- turn an unknown into an affirmative answer;
- infer sensitive facts from absence of evidence;
- expose internal evidence excerpts not approved for disclosure.

## Article 9 — Contradictions

Contradictions are product outputs, not retrieval failures.

When relevant authoritative sources conflict, the system must:

- identify the conflicting claims;
- display both sources and their scopes;
- avoid selecting one silently;
- mark dependent answers `contradicted`;
- route the item to the appropriate knowledge owner or reviewer;
- preserve the resolution and supersession decision in the audit trail.

## Article 10 — Human edits and institutional memory

Human edits do not automatically become global truth.

A material edit intended for reuse must capture:

- editor and approver;
- evidence or explicit human-assertion status;
- organization and product scope;
- environment, region, data class, and customer context where relevant;
- effective date and review date;
- reuse permission;
- reason for overriding the generated answer;
- linked original question and normalized claim.

The system may suggest a prior approved answer only after checking scope, freshness, evidence status, and contradictions.

## Article 11 — Human accountability

Before an answer is externally represented as final:

- required approvals must be complete;
- unresolved launch-blocking states must be absent or explicitly waived by an authorized role;
- the final approver must act on a frozen questionnaire snapshot;
- later edits must invalidate the affected approval;
- the final export must be traceable to the exact approved snapshot.

Attestly may make review efficient; it may not make accountability ambiguous.

## Article 12 — Untrusted content and prompt injection

All imported questionnaires, evidence files, OCR text, comments, metadata, formulas, hidden content, links, and prior answers are untrusted data.

They must never be allowed to:

- modify system or developer instructions;
- request tools or data outside the current authorized operation;
- widen tenant scope;
- retrieve unrelated documents;
- reveal secrets, prompts, logs, or other customer information;
- bypass output validation or approval requirements.

System instructions, tool permissions, retrieval filters, and output validators must be controlled outside the untrusted content channel.

## Article 13 — Tenant isolation

Tenant identity is mandatory on every customer-owned object, cache key, job, search, model context, export, and audit event.

Authorization and tenant filtering must occur before retrieval and generation, not after results are produced.

No feature may ship if its tenant isolation cannot be tested automatically.

A suspected cross-tenant exposure triggers immediate containment, incident response, and suspension of affected processing.

## Article 14 — Data minimization and disclosure

The system sends only the minimum necessary information to each subsystem and model provider.

Internal evidence sensitivity and external disclosure permission are distinct fields. Evidence may be valid for internal decision-making yet prohibited from being quoted or attached to a customer.

Generated exports must exclude internal prompts, hidden reasoning, private comments, unnecessary evidence excerpts, credentials, secrets, and internal-only metadata.

## Article 15 — Models are replaceable

Provider and model selection are implementation configuration.

The durable system consists of:

- evidence and scope rules;
- retrieval filters;
- structured schemas;
- deterministic validators;
- approval workflows;
- evaluation datasets;
- audit records.

No launch requirement may depend solely on a model's self-reported confidence or undocumented behavior.

## Article 16 — Safe failure

When a component fails, Attestly must prefer a visible incomplete state over a plausible unsupported result.

Examples:

- failed extraction → block automatic evidence use;
- retrieval error → no generated supported answer;
- schema validation failure → discard output and expose retry/error state;
- expired evidence → downgrade state and require review;
- export incompatibility → block final export or produce an explicit compatibility warning requiring approval;
- unavailable model → preserve existing approved answers and queue work without silently switching behavior outside policy.

## Article 17 — Change control

Changes to this constitution require:

1. a written ADR describing the problem and alternatives;
2. threat-model impact analysis;
3. evaluation and regression impact analysis;
4. migration or compatibility plan where stored records are affected;
5. approval from product and security owners;
6. updated acceptance criteria and documentation.

Commercial urgency alone is not sufficient justification to weaken a constitution rule.
