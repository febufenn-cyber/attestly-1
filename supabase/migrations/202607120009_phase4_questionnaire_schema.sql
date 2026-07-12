-- Attestly Phase 4: questionnaire intelligence and structure-preserving export.

create type public.questionnaire_format as enum ('xlsx', 'csv', 'docx', 'pdf');
create type public.questionnaire_compatibility_status as enum (
  'compatible',
  'compatible_with_warnings',
  'manual_mapping_required',
  'import_only',
  'unsupported'
);
create type public.questionnaire_import_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed_retryable',
  'failed_terminal'
);
create type public.questionnaire_mapping_status as enum ('draft', 'frozen', 'superseded');
create type public.questionnaire_snapshot_status as enum ('frozen', 'invalidated', 'answering', 'approved', 'exported');
create type public.questionnaire_question_type as enum (
  'boolean', 'boolean_with_explanation', 'single_choice', 'multi_choice', 'free_text',
  'numeric', 'date', 'percentage', 'attachment_request', 'table_row', 'matrix',
  'compound', 'conditional_parent', 'conditional_child', 'acknowledgement', 'unknown'
);
create type public.questionnaire_polarity as enum ('positive', 'negative', 'neutral', 'unknown');
create type public.questionnaire_destination_type as enum (
  'xlsx_cell', 'csv_field', 'docx_content_control', 'docx_table_cell', 'manual'
);
create type public.questionnaire_warning_severity as enum ('info', 'warning', 'critical');
create type public.questionnaire_export_status as enum (
  'draft', 'validated', 'executing', 'succeeded', 'failed', 'blocked'
);
create type public.questionnaire_diff_classification as enum (
  'expected', 'benign_metadata', 'requires_review', 'blocking'
);

create table public.questionnaire_artifacts (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  stored_object_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  format public.questionnaire_format not null,
  original_filename text not null,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'retired', 'deletion_requested', 'deleted')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, stored_object_id),
  constraint questionnaire_artifact_object_fk foreign key (tenant_id, stored_object_id)
    references public.stored_objects(tenant_id, id) on delete restrict
);

create table public.questionnaire_import_runs (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  questionnaire_artifact_id uuid not null,
  job_id uuid,
  status public.questionnaire_import_status not null default 'pending',
  processor_name text,
  processor_version text,
  ruleset_version text,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_hash text check (manifest_hash is null or manifest_hash ~ '^[a-f0-9]{64}$'),
  structural_fingerprint text check (structural_fingerprint is null or structural_fingerprint ~ '^[a-f0-9]{64}$'),
  compatibility_status public.questionnaire_compatibility_status,
  compatibility_dimensions jsonb not null default '{}'::jsonb,
  manifest jsonb,
  statistics jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error_detail text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  primary key (tenant_id, id),
  constraint questionnaire_import_artifact_fk foreign key (tenant_id, questionnaire_artifact_id)
    references public.questionnaire_artifacts(tenant_id, id) on delete cascade,
  constraint questionnaire_import_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete restrict
);

create table public.questionnaire_mapping_versions (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  questionnaire_artifact_id uuid not null,
  import_run_id uuid not null,
  parent_mapping_version_id uuid,
  version_number integer not null check (version_number > 0),
  status public.questionnaire_mapping_status not null default 'draft',
  compatibility_status public.questionnaire_compatibility_status not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  structural_fingerprint text not null check (structural_fingerprint ~ '^[a-f0-9]{64}$'),
  processor_version text not null,
  target_scope jsonb not null default '{"mode":"unknown"}'::jsonb,
  mapping_notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  frozen_by uuid references auth.users(id),
  frozen_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, questionnaire_artifact_id, version_number),
  constraint questionnaire_mapping_artifact_fk foreign key (tenant_id, questionnaire_artifact_id)
    references public.questionnaire_artifacts(tenant_id, id) on delete cascade,
  constraint questionnaire_mapping_import_fk foreign key (tenant_id, import_run_id)
    references public.questionnaire_import_runs(tenant_id, id) on delete restrict,
  constraint questionnaire_mapping_parent_fk foreign key (tenant_id, parent_mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete restrict
);

create table public.questionnaire_sections (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  mapping_version_id uuid not null,
  local_id text not null,
  parent_local_id text,
  title text not null,
  original_title text not null,
  display_order integer not null,
  source_location jsonb not null default '{}'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  primary key (tenant_id, id),
  unique (tenant_id, mapping_version_id, local_id),
  constraint questionnaire_section_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete cascade
);

create table public.questionnaire_questions (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  mapping_version_id uuid not null,
  local_id text not null,
  section_local_id text,
  parent_local_id text,
  external_identifier text,
  original_text text not null,
  normalized_text text not null,
  question_type public.questionnaire_question_type not null,
  polarity public.questionnaire_polarity not null default 'unknown',
  display_order integer not null,
  source_location jsonb not null,
  answer_format jsonb not null,
  inclusion_status text not null default 'included' check (inclusion_status in ('included', 'excluded', 'needs_review')),
  mapping_confidence jsonb not null,
  parser_notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, mapping_version_id, local_id),
  constraint questionnaire_question_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete cascade
);

create table public.questionnaire_answer_destinations (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  mapping_version_id uuid not null,
  local_id text not null,
  question_local_id text,
  destination_type public.questionnaire_destination_type not null,
  source_location jsonb not null,
  expected_value_type text not null,
  allowed_values text[] not null default '{}',
  stored_values jsonb not null default '{}'::jsonb,
  formula_present boolean not null default false,
  protected boolean not null default false,
  style_hash text,
  validation_hash text,
  write_strategy text not null check (write_strategy in ('replace_value', 'append_text', 'manual')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, mapping_version_id, local_id),
  constraint questionnaire_destination_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete cascade
);

create table public.questionnaire_atomic_requests (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  mapping_version_id uuid not null,
  question_local_id text not null,
  local_id text not null,
  sequence integer not null check (sequence > 0),
  original_clause text not null,
  normalized_claim text not null,
  qualifiers text[] not null default '{}',
  materiality text not null check (materiality in ('material', 'supporting')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, mapping_version_id, question_local_id, local_id),
  constraint questionnaire_atomic_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete cascade
);

create table public.questionnaire_conditions (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  mapping_version_id uuid not null,
  local_id text not null,
  child_question_local_id text not null,
  original_instruction text not null,
  expression jsonb not null,
  parser_confidence numeric not null check (parser_confidence between 0 and 1),
  human_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, mapping_version_id, local_id),
  constraint questionnaire_condition_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete cascade
);

create table public.questionnaire_instructions (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  mapping_version_id uuid not null,
  local_id text not null,
  instruction_scope text not null check (instruction_scope in ('workbook', 'sheet', 'section', 'question', 'answer_field')),
  category text not null,
  instruction_text text not null,
  source_location jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, mapping_version_id, local_id),
  constraint questionnaire_instruction_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete cascade
);

create table public.questionnaire_import_warnings (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  import_run_id uuid not null,
  mapping_version_id uuid,
  code text not null,
  severity public.questionnaire_warning_severity not null,
  message text not null,
  source_location jsonb,
  affected_question_local_ids text[] not null default '{}',
  affected_destination_local_ids text[] not null default '{}',
  recommended_action text not null,
  export_blocking boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint questionnaire_warning_import_fk foreign key (tenant_id, import_run_id)
    references public.questionnaire_import_runs(tenant_id, id) on delete cascade,
  constraint questionnaire_warning_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete cascade
);

create table public.questionnaire_snapshots (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  questionnaire_artifact_id uuid not null,
  mapping_version_id uuid not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  status public.questionnaire_snapshot_status not null default 'frozen',
  target_scope jsonb not null,
  question_count integer not null check (question_count >= 0),
  atomic_request_count integer not null check (atomic_request_count >= 0),
  frozen_by uuid not null references auth.users(id),
  frozen_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidation_reason text,
  primary key (tenant_id, id),
  unique (tenant_id, mapping_version_id),
  unique (tenant_id, snapshot_hash),
  constraint questionnaire_snapshot_artifact_fk foreign key (tenant_id, questionnaire_artifact_id)
    references public.questionnaire_artifacts(tenant_id, id) on delete restrict,
  constraint questionnaire_snapshot_mapping_fk foreign key (tenant_id, mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete restrict
);

create table public.questionnaire_mapping_templates (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null,
  structural_fingerprint text not null check (structural_fingerprint ~ '^[a-f0-9]{64}$'),
  source_mapping_version_id uuid not null,
  template_data jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, structural_fingerprint, name),
  constraint questionnaire_template_mapping_fk foreign key (tenant_id, source_mapping_version_id)
    references public.questionnaire_mapping_versions(tenant_id, id) on delete restrict
);

create table public.questionnaire_export_plans (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  questionnaire_snapshot_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  answer_snapshot_hash text not null check (answer_snapshot_hash ~ '^[a-f0-9]{64}$'),
  status public.questionnaire_export_status not null default 'draft',
  blocking_errors text[] not null default '{}',
  expected_change_count integer not null default 0 check (expected_change_count >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  primary key (tenant_id, id),
  constraint questionnaire_export_plan_snapshot_fk foreign key (tenant_id, questionnaire_snapshot_id)
    references public.questionnaire_snapshots(tenant_id, id) on delete restrict
);

create table public.questionnaire_export_operations (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  export_plan_id uuid not null,
  local_id text not null,
  question_local_id text not null,
  destination_local_id text not null,
  operation_type text not null,
  outward_value jsonb,
  expected_original_value jsonb,
  expected_formula_state boolean not null default false,
  expected_style_hash text,
  expected_validation_hash text,
  condition_activation text not null check (condition_activation in ('active', 'inactive', 'unknown')),
  display_order integer not null,
  primary key (tenant_id, id),
  unique (tenant_id, export_plan_id, local_id),
  constraint questionnaire_export_operation_plan_fk foreign key (tenant_id, export_plan_id)
    references public.questionnaire_export_plans(tenant_id, id) on delete cascade
);

create table public.questionnaire_export_runs (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  export_plan_id uuid not null,
  job_id uuid,
  output_object_id uuid,
  status public.questionnaire_export_status not null default 'executing',
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[a-f0-9]{64}$'),
  changed_locations text[] not null default '{}',
  warnings text[] not null default '{}',
  last_error_code text,
  last_error_detail text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (tenant_id, id),
  constraint questionnaire_export_run_plan_fk foreign key (tenant_id, export_plan_id)
    references public.questionnaire_export_plans(tenant_id, id) on delete restrict,
  constraint questionnaire_export_run_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete restrict,
  constraint questionnaire_export_output_fk foreign key (tenant_id, output_object_id)
    references public.stored_objects(tenant_id, id) on delete restrict
);

create table public.questionnaire_export_diffs (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  export_run_id uuid not null,
  package_path text not null,
  before_hash text,
  after_hash text,
  classification public.questionnaire_diff_classification not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint questionnaire_export_diff_run_fk foreign key (tenant_id, export_run_id)
    references public.questionnaire_export_runs(tenant_id, id) on delete cascade
);

create table public.questionnaire_queue_outbox (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  job_id uuid not null,
  questionnaire_artifact_id uuid,
  export_plan_id uuid,
  topic text not null check (topic in ('inspect_questionnaire', 'export_questionnaire')),
  payload jsonb not null,
  available_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint questionnaire_outbox_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete cascade,
  constraint questionnaire_outbox_artifact_fk foreign key (tenant_id, questionnaire_artifact_id)
    references public.questionnaire_artifacts(tenant_id, id) on delete cascade,
  constraint questionnaire_outbox_plan_fk foreign key (tenant_id, export_plan_id)
    references public.questionnaire_export_plans(tenant_id, id) on delete cascade,
  constraint questionnaire_outbox_one_target check (
    (topic = 'inspect_questionnaire' and questionnaire_artifact_id is not null and export_plan_id is null)
    or (topic = 'export_questionnaire' and export_plan_id is not null and questionnaire_artifact_id is null)
  ),
  constraint questionnaire_queue_outbox_job_unique unique (tenant_id, job_id)
);

create index questionnaire_artifacts_tenant_created_idx on public.questionnaire_artifacts(tenant_id, created_at desc);
create index questionnaire_import_runs_artifact_idx on public.questionnaire_import_runs(tenant_id, questionnaire_artifact_id, created_at desc);
create index questionnaire_mapping_artifact_idx on public.questionnaire_mapping_versions(tenant_id, questionnaire_artifact_id, version_number desc);
create index questionnaire_questions_mapping_order_idx on public.questionnaire_questions(tenant_id, mapping_version_id, display_order);
create index questionnaire_warnings_unresolved_idx on public.questionnaire_import_warnings(tenant_id, mapping_version_id, severity) where resolved_at is null;
create index questionnaire_snapshots_tenant_idx on public.questionnaire_snapshots(tenant_id, frozen_at desc);
create index questionnaire_export_plans_snapshot_idx on public.questionnaire_export_plans(tenant_id, questionnaire_snapshot_id, created_at desc);
create index questionnaire_outbox_pending_idx on public.questionnaire_queue_outbox(available_at, created_at) where dispatched_at is null;
