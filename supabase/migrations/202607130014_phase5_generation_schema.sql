-- Attestly Phase 5: immutable answer-generation runs and claim-level provenance.

create type public.generation_operation as enum (
  'internal_answer_draft',
  'external_summary_draft',
  'external_quote_draft'
);

create type public.generation_status as enum (
  'pending',
  'retrieving',
  'generating',
  'validating',
  'succeeded',
  'blocked',
  'failed_retryable',
  'failed_terminal',
  'cancelled'
);

create type public.answer_state as enum (
  'supported',
  'partially_supported',
  'historically_supported',
  'scope_mismatch',
  'contradicted',
  'no_evidence',
  'requires_sme',
  'requires_legal',
  'not_applicable',
  'ambiguous_question',
  'blocked_from_automation'
);

create type public.claim_disposition as enum (
  'supported',
  'unsupported',
  'historical_only',
  'scope_mismatch',
  'contradicted',
  'requires_sme',
  'requires_legal',
  'not_applicable',
  'ambiguous',
  'blocked'
);

create type public.answer_risk_tier as enum ('low', 'medium', 'high', 'critical');
create type public.answer_citation_role as enum ('supports', 'limits', 'contradicts', 'context');

create table public.generation_runs (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  questionnaire_snapshot_id uuid not null,
  mapping_version_id uuid not null,
  question_id uuid not null,
  job_id uuid not null,
  operation public.generation_operation not null,
  status public.generation_status not null default 'pending',
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  requested_scope jsonb not null,
  provider text not null check (char_length(provider) between 1 and 120),
  model text not null check (char_length(model) between 1 and 200),
  model_version text,
  prompt_version text not null check (char_length(prompt_version) between 1 and 120),
  schema_version integer not null default 1 check (schema_version > 0),
  idempotency_key text not null,
  input_hash text check (input_hash is null or input_hash ~ '^[a-f0-9]{64}$'),
  input_snapshot jsonb,
  output_hash text check (output_hash is null or output_hash ~ '^[a-f0-9]{64}$'),
  validation_result jsonb,
  failure_code text,
  failure_detail text,
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, job_id),
  constraint generation_run_snapshot_fk foreign key (tenant_id, questionnaire_snapshot_id)
    references public.questionnaire_snapshots(tenant_id, id) on delete restrict,
  constraint generation_run_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete restrict,
  constraint generation_run_question_fk foreign key (tenant_id, question_id)
    references public.questionnaire_questions(tenant_id, id) on delete restrict,
  constraint generation_run_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete restrict
);

create table public.generation_candidates (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  generation_run_id uuid not null,
  evidence_span_id uuid not null,
  evidence_version_id uuid not null,
  retrieval_run_id uuid,
  candidate_order integer not null check (candidate_order > 0),
  candidate_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, generation_run_id, evidence_span_id),
  constraint generation_candidate_run_fk foreign key (tenant_id, generation_run_id)
    references public.generation_runs(tenant_id, id) on delete cascade,
  constraint generation_candidate_span_fk foreign key (tenant_id, evidence_span_id)
    references public.evidence_spans(tenant_id, id) on delete restrict,
  constraint generation_candidate_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete restrict,
  constraint generation_candidate_retrieval_fk foreign key (tenant_id, retrieval_run_id)
    references public.retrieval_runs(tenant_id, id) on delete set null
);

create table public.answer_revisions (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  generation_run_id uuid not null,
  questionnaire_snapshot_id uuid not null,
  question_id uuid not null,
  revision_number integer not null default 1 check (revision_number > 0),
  state public.answer_state not null,
  outward_value text,
  outward_text text not null default '',
  confidence jsonb not null,
  risk_tier public.answer_risk_tier not null,
  required_reviewers text[] not null default '{}',
  limitations text[] not null default '{}',
  contradictions text[] not null default '{}',
  missing_information text[] not null default '{}',
  model_identity jsonb not null,
  validation_result jsonb not null,
  generation_input_hash text not null check (generation_input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  origin text not null default 'model_generated' check (origin = 'model_generated'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, generation_run_id, revision_number),
  constraint answer_revision_run_fk foreign key (tenant_id, generation_run_id)
    references public.generation_runs(tenant_id, id) on delete restrict,
  constraint answer_revision_snapshot_fk foreign key (tenant_id, questionnaire_snapshot_id)
    references public.questionnaire_snapshots(tenant_id, id) on delete restrict,
  constraint answer_revision_question_fk foreign key (tenant_id, question_id)
    references public.questionnaire_questions(tenant_id, id) on delete restrict
);

create table public.answer_claims (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  answer_revision_id uuid not null,
  atomic_request_id uuid not null,
  claim_local_id text not null,
  original_clause text not null,
  normalized_claim text not null,
  qualifiers text[] not null default '{}',
  materiality text not null check (materiality in ('material', 'supporting')),
  disposition public.claim_disposition not null,
  proposed_statement text not null default '',
  reasons text[] not null default '{}',
  missing_information text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, answer_revision_id, claim_local_id),
  constraint answer_claim_revision_fk foreign key (tenant_id, answer_revision_id)
    references public.answer_revisions(tenant_id, id) on delete cascade,
  constraint answer_claim_atomic_fk foreign key (tenant_id, atomic_request_id)
    references public.questionnaire_atomic_requests(tenant_id, id) on delete restrict
);

create table public.answer_citations (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  answer_revision_id uuid not null,
  answer_claim_id uuid not null,
  evidence_span_id uuid not null,
  evidence_version_id uuid not null,
  citation_role public.answer_citation_role not null,
  quote text not null check (char_length(quote) between 1 and 5000),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, answer_claim_id, evidence_span_id, citation_role),
  constraint answer_citation_revision_fk foreign key (tenant_id, answer_revision_id)
    references public.answer_revisions(tenant_id, id) on delete cascade,
  constraint answer_citation_claim_fk foreign key (tenant_id, answer_claim_id)
    references public.answer_claims(tenant_id, id) on delete cascade,
  constraint answer_citation_span_fk foreign key (tenant_id, evidence_span_id)
    references public.evidence_spans(tenant_id, id) on delete restrict,
  constraint answer_citation_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete restrict
);

create table public.generation_queue_outbox (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  job_id uuid not null,
  generation_run_id uuid not null,
  topic text not null check (topic = 'generate_answer'),
  payload jsonb not null,
  available_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0 check (dispatch_attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint generation_queue_job_unique unique (tenant_id, job_id),
  constraint generation_queue_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete cascade,
  constraint generation_queue_run_fk foreign key (tenant_id, generation_run_id)
    references public.generation_runs(tenant_id, id) on delete cascade
);

create index generation_runs_snapshot_idx on public.generation_runs(tenant_id, questionnaire_snapshot_id, created_at desc);
create index generation_runs_requester_idx on public.generation_runs(tenant_id, requested_by, created_at desc);
create index generation_candidates_run_idx on public.generation_candidates(tenant_id, generation_run_id, candidate_order);
create index answer_revisions_question_idx on public.answer_revisions(tenant_id, questionnaire_snapshot_id, question_id, created_at desc);
create index answer_claims_revision_idx on public.answer_claims(tenant_id, answer_revision_id);
create index answer_citations_revision_idx on public.answer_citations(tenant_id, answer_revision_id);
create index generation_outbox_pending_idx on public.generation_queue_outbox(available_at, created_at) where dispatched_at is null;
