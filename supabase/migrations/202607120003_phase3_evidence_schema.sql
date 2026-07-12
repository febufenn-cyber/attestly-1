-- Attestly Phase 3: evidence documents, extraction provenance, approval, and retrieval.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

create type public.evidence_class as enum (
  'independent_attestation',
  'operational_proof',
  'implementation_documentation',
  'governance_evidence',
  'historical_representation',
  'unverified_statement'
);
create type public.evidence_confidentiality as enum ('public', 'internal', 'confidential', 'restricted');
create type public.evidence_disclosure_policy as enum (
  'external_quote_allowed',
  'external_summary_only',
  'internal_citation_only',
  'prohibited'
);
create type public.scope_mode as enum ('all', 'selected', 'unknown');
create type public.scope_match_result as enum ('exact', 'compatible', 'partial', 'mismatch', 'unknown');
create type public.evidence_lifecycle_status as enum (
  'draft',
  'metadata_incomplete',
  'extraction_review_required',
  'ready_for_review',
  'approved',
  'approved_restricted',
  'rejected',
  'superseded',
  'retired',
  'deletion_requested',
  'deleted'
);
create type public.extraction_status as enum (
  'not_started',
  'pending',
  'running',
  'partial',
  'succeeded',
  'failed_retryable',
  'failed_terminal'
);
create type public.index_status as enum ('not_indexed', 'indexing', 'ready', 'stale', 'failed');
create type public.malware_scan_status as enum (
  'pending',
  'clean',
  'unavailable',
  'suspicious',
  'malware_detected'
);
create type public.extraction_method as enum (
  'native_text',
  'structured_ooxml',
  'spreadsheet_cell',
  'ocr',
  'machine_description',
  'human_annotation'
);
create type public.evidence_relation_type as enum (
  'supersedes',
  'implements',
  'operates_control',
  'attests_to',
  'contradicts',
  'clarifies',
  'derived_from',
  'applies_with'
);
create type public.evidence_approval_decision as enum ('approved', 'rejected', 'reopened');

alter table public.stored_objects
  add column if not exists malware_scan_status public.malware_scan_status not null default 'pending';

create table public.evidence_scopes (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  mode public.scope_mode not null,
  legal_entities text[] not null default '{}',
  business_units text[] not null default '{}',
  products text[] not null default '{}',
  product_version_expression text,
  environments text[] not null default '{}',
  regions text[] not null default '{}',
  data_classes text[] not null default '{}',
  deployment_models text[] not null default '{}',
  customer_segments text[] not null default '{}',
  effective_from date,
  effective_until date,
  custom_dimensions jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint evidence_scope_dates check (effective_until is null or effective_from is null or effective_until >= effective_from),
  constraint selected_scope_not_empty check (
    mode <> 'selected'
    or cardinality(legal_entities) + cardinality(business_units) + cardinality(products)
      + cardinality(environments) + cardinality(regions) + cardinality(data_classes)
      + cardinality(deployment_models) + cardinality(customer_segments) > 0
  )
);

create table public.evidence_documents (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 500),
  source_type text not null check (char_length(source_type) between 2 and 120),
  evidence_class public.evidence_class not null,
  owner_user_id uuid not null references auth.users(id),
  confidentiality public.evidence_confidentiality not null,
  disclosure_policy public.evidence_disclosure_policy not null,
  scope_id uuid not null,
  lifecycle_status public.evidence_lifecycle_status not null default 'draft',
  current_version_id uuid,
  review_cycle_days integer check (review_cycle_days is null or review_cycle_days between 1 and 3650),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retired_at timestamptz,
  deleted_at timestamptz,
  primary key (tenant_id, id),
  constraint evidence_document_scope_fk foreign key (tenant_id, scope_id)
    references public.evidence_scopes(tenant_id, id) on delete restrict
);

create table public.evidence_versions (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  evidence_document_id uuid not null,
  stored_object_id uuid not null,
  scope_id uuid not null,
  version_label text not null check (char_length(version_label) between 1 and 120),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  effective_from date,
  effective_until date,
  review_due_at date,
  lifecycle_status public.evidence_lifecycle_status not null default 'draft',
  extraction_status public.extraction_status not null default 'not_started',
  index_status public.index_status not null default 'not_indexed',
  malware_scan_status public.malware_scan_status not null default 'pending',
  extraction_quality numeric(6,5),
  extractor_name text,
  extractor_version text,
  normalization_ruleset_version text,
  manifest_hash text check (manifest_hash is null or manifest_hash ~ '^[a-f0-9]{64}$'),
  supersedes_version_id uuid,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, evidence_document_id, version_label),
  unique (tenant_id, evidence_document_id, source_sha256),
  constraint evidence_version_document_fk foreign key (tenant_id, evidence_document_id)
    references public.evidence_documents(tenant_id, id) on delete restrict,
  constraint evidence_version_object_fk foreign key (tenant_id, stored_object_id)
    references public.stored_objects(tenant_id, id) on delete restrict,
  constraint evidence_version_scope_fk foreign key (tenant_id, scope_id)
    references public.evidence_scopes(tenant_id, id) on delete restrict,
  constraint evidence_version_supersedes_fk foreign key (tenant_id, supersedes_version_id)
    references public.evidence_versions(tenant_id, id) on delete restrict,
  constraint evidence_version_dates check (effective_until is null or effective_from is null or effective_until >= effective_from),
  constraint evidence_quality_range check (extraction_quality is null or extraction_quality between 0 and 1)
);

alter table public.evidence_documents
  add constraint evidence_document_current_version_fk
  foreign key (tenant_id, current_version_id)
  references public.evidence_versions(tenant_id, id)
  deferrable initially deferred;

create table public.extraction_runs (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  evidence_version_id uuid not null,
  job_id uuid,
  status public.extraction_status not null default 'pending',
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  extractor_name text not null,
  extractor_version text not null,
  normalization_ruleset_version text not null,
  manifest_hash text check (manifest_hash is null or manifest_hash ~ '^[a-f0-9]{64}$'),
  quality jsonb,
  statistics jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, evidence_version_id, source_sha256, extractor_name, extractor_version, normalization_ruleset_version),
  constraint extraction_run_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade,
  constraint extraction_run_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete set null
);

create table public.extraction_nodes (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  extraction_run_id uuid not null,
  evidence_version_id uuid not null,
  local_id text not null,
  parent_local_id text,
  node_type text not null,
  display_order integer not null check (display_order >= 0),
  text_content text not null default '',
  normalized_text text not null default '',
  page_number integer check (page_number is null or page_number > 0),
  sheet_name text,
  cell_range text,
  heading_path text[] not null default '{}',
  paragraph_index integer,
  character_start integer,
  character_end integer,
  bounding_box jsonb,
  extraction_method public.extraction_method not null,
  extraction_confidence numeric(6,5) not null check (extraction_confidence between 0 and 1),
  flags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, extraction_run_id, local_id),
  constraint extraction_node_run_fk foreign key (tenant_id, extraction_run_id)
    references public.extraction_runs(tenant_id, id) on delete cascade,
  constraint extraction_node_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade
);

create table public.extraction_warnings (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  extraction_run_id uuid not null,
  evidence_version_id uuid not null,
  code text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  message text not null,
  node_local_id text,
  page_number integer,
  sheet_name text,
  metadata jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint extraction_warning_run_fk foreign key (tenant_id, extraction_run_id)
    references public.extraction_runs(tenant_id, id) on delete cascade,
  constraint extraction_warning_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade
);

create table public.evidence_spans (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  evidence_version_id uuid not null,
  extraction_run_id uuid not null,
  local_id text not null,
  source_node_local_ids text[] not null,
  text_content text not null,
  normalized_text text not null,
  page_number integer,
  sheet_name text,
  cell_range text,
  heading_path text[] not null default '{}',
  extraction_method public.extraction_method not null,
  extraction_confidence numeric(6,5) not null check (extraction_confidence between 0 and 1),
  source_location jsonb not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  search_document tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(normalized_text, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, evidence_version_id, content_hash, local_id),
  constraint evidence_span_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade,
  constraint evidence_span_run_fk foreign key (tenant_id, extraction_run_id)
    references public.extraction_runs(tenant_id, id) on delete cascade
);

create table public.evidence_span_embeddings (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  evidence_span_id uuid not null,
  provider text not null,
  model text not null,
  dimensions integer not null check (dimensions > 0),
  ruleset_version text not null,
  source_content_hash text not null check (source_content_hash ~ '^[a-f0-9]{64}$'),
  embedding extensions.vector not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, evidence_span_id, provider, model, ruleset_version),
  constraint evidence_embedding_span_fk foreign key (tenant_id, evidence_span_id)
    references public.evidence_spans(tenant_id, id) on delete cascade
);

create table public.evidence_approvals (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  evidence_version_id uuid not null,
  decision public.evidence_approval_decision not null,
  rationale text not null check (char_length(rationale) between 3 and 4000),
  approved_scope_id uuid not null,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint evidence_approval_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade,
  constraint evidence_approval_scope_fk foreign key (tenant_id, approved_scope_id)
    references public.evidence_scopes(tenant_id, id) on delete restrict
);

create table public.evidence_relations (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  source_version_id uuid not null,
  target_version_id uuid not null,
  relation_type public.evidence_relation_type not null,
  description text not null check (char_length(description) between 3 and 2000),
  approved boolean not null default false,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, source_version_id, target_version_id, relation_type),
  constraint evidence_relation_source_fk foreign key (tenant_id, source_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade,
  constraint evidence_relation_target_fk foreign key (tenant_id, target_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade,
  constraint evidence_relation_not_self check (source_version_id <> target_version_id)
);

create table public.evidence_queue_outbox (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  job_id uuid not null,
  evidence_version_id uuid not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0 check (dispatch_attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint evidence_queue_outbox_job_unique unique (tenant_id, job_id),
  constraint evidence_outbox_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete cascade,
  constraint evidence_outbox_version_fk foreign key (tenant_id, evidence_version_id)
    references public.evidence_versions(tenant_id, id) on delete cascade
);

create table public.retrieval_runs (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  query_text text not null check (char_length(query_text) between 1 and 4000),
  requested_scope jsonb not null,
  operation text not null,
  include_historical boolean not null default false,
  ruleset_version text not null default 'phase3-v1',
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table public.retrieval_candidates (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  retrieval_run_id uuid not null,
  evidence_span_id uuid not null,
  keyword_score numeric(8,7) not null,
  scope_match public.scope_match_result not null,
  authority_score numeric(8,7) not null,
  freshness_score numeric(8,7) not null,
  extraction_quality numeric(8,7) not null,
  final_rank numeric(8,7) not null,
  selected boolean not null default true,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, retrieval_run_id, evidence_span_id),
  constraint retrieval_candidate_run_fk foreign key (tenant_id, retrieval_run_id)
    references public.retrieval_runs(tenant_id, id) on delete cascade,
  constraint retrieval_candidate_span_fk foreign key (tenant_id, evidence_span_id)
    references public.evidence_spans(tenant_id, id) on delete cascade
);

create index evidence_documents_tenant_status_idx on public.evidence_documents(tenant_id, lifecycle_status, updated_at desc);
create index evidence_versions_document_idx on public.evidence_versions(tenant_id, evidence_document_id, created_at desc);
create index extraction_runs_version_idx on public.extraction_runs(tenant_id, evidence_version_id, created_at desc);
create index evidence_spans_search_idx on public.evidence_spans using gin(search_document);
create index evidence_spans_trgm_idx on public.evidence_spans using gin(normalized_text extensions.gin_trgm_ops);
create index evidence_spans_version_idx on public.evidence_spans(tenant_id, evidence_version_id, page_number, sheet_name);
create index evidence_relations_target_idx on public.evidence_relations(tenant_id, target_version_id, relation_type) where approved;
create index evidence_outbox_pending_idx on public.evidence_queue_outbox(available_at, created_at) where dispatched_at is null;

create trigger evidence_documents_touch_updated_at
before update on public.evidence_documents
for each row execute function public.touch_updated_at();
create trigger evidence_versions_touch_updated_at
before update on public.evidence_versions
for each row execute function public.touch_updated_at();
