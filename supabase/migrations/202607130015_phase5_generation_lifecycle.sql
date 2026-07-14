create or replace function public.protect_generation_run()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Generation runs are retained for audit';
  end if;
  if new.tenant_id <> old.tenant_id
    or new.id <> old.id
    or new.questionnaire_snapshot_id <> old.questionnaire_snapshot_id
    or new.mapping_version_id <> old.mapping_version_id
    or new.question_id <> old.question_id
    or new.job_id <> old.job_id
    or new.operation <> old.operation
    or new.snapshot_hash <> old.snapshot_hash
    or new.requested_scope <> old.requested_scope
    or new.provider <> old.provider
    or new.model <> old.model
    or new.model_version is distinct from old.model_version
    or new.prompt_version <> old.prompt_version
    or new.schema_version <> old.schema_version
    or new.idempotency_key <> old.idempotency_key
    or new.requested_by <> old.requested_by
  then
    raise exception using errcode = '42501', message = 'Generation run identity is immutable';
  end if;
  if old.input_hash is not null and (
    new.input_hash is distinct from old.input_hash or new.input_snapshot is distinct from old.input_snapshot
  ) then
    raise exception using errcode = '42501', message = 'Generation input snapshot is immutable';
  end if;
  if old.output_hash is not null and new.output_hash is distinct from old.output_hash then
    raise exception using errcode = '42501', message = 'Generation output hash is immutable';
  end if;
  if old.status in ('succeeded', 'blocked', 'failed_terminal', 'cancelled') and new.status <> old.status then
    raise exception using errcode = '42501', message = 'Terminal generation status is immutable';
  end if;
  return new;
end;
$$;

create trigger generation_runs_protect_identity
before update or delete on public.generation_runs
for each row execute function public.protect_generation_run();

create or replace function public.protect_append_only_generation_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception using errcode = '42501', message = 'Generation provenance records are append-only';
end;
$$;

create trigger generation_candidates_append_only
before update or delete on public.generation_candidates
for each row execute function public.protect_append_only_generation_record();
create trigger answer_revisions_append_only
before update or delete on public.answer_revisions
for each row execute function public.protect_append_only_generation_record();
create trigger answer_claims_append_only
before update or delete on public.answer_claims
for each row execute function public.protect_append_only_generation_record();
create trigger answer_citations_append_only
before update or delete on public.answer_citations
for each row execute function public.protect_append_only_generation_record();

create or replace function public.validate_generation_candidate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  span_version uuid;
begin
  select evidence_version_id into span_version
  from public.evidence_spans
  where tenant_id = new.tenant_id and id = new.evidence_span_id;
  if span_version is null or span_version <> new.evidence_version_id then
    raise exception using errcode = '23514', message = 'Candidate span and evidence version do not match';
  end if;
  return new;
end;
$$;

create trigger generation_candidates_validate_version
before insert on public.generation_candidates
for each row execute function public.validate_generation_candidate();

create or replace function public.validate_answer_claim()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  revision_row public.answer_revisions;
  run_row public.generation_runs;
  question_row public.questionnaire_questions;
  atomic_row public.questionnaire_atomic_requests;
begin
  select * into revision_row from public.answer_revisions
  where tenant_id = new.tenant_id and id = new.answer_revision_id;
  select * into run_row from public.generation_runs
  where tenant_id = new.tenant_id and id = revision_row.generation_run_id;
  select * into question_row from public.questionnaire_questions
  where tenant_id = new.tenant_id and id = run_row.question_id;
  select * into atomic_row from public.questionnaire_atomic_requests
  where tenant_id = new.tenant_id and id = new.atomic_request_id;
  if atomic_row.id is null
    or atomic_row.mapping_version_id <> run_row.mapping_version_id
    or atomic_row.question_local_id <> question_row.local_id
    or atomic_row.local_id <> new.claim_local_id
  then
    raise exception using errcode = '23514', message = 'Answer claim does not match the frozen atomic request';
  end if;
  return new;
end;
$$;

create trigger answer_claims_validate_atomic_request
before insert on public.answer_claims
for each row execute function public.validate_answer_claim();

create or replace function public.validate_answer_citation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  claim_revision uuid;
  run_id uuid;
  span_version uuid;
begin
  select answer_revision_id into claim_revision from public.answer_claims
  where tenant_id = new.tenant_id and id = new.answer_claim_id;
  if claim_revision is null or claim_revision <> new.answer_revision_id then
    raise exception using errcode = '23514', message = 'Citation claim and revision do not match';
  end if;
  select generation_run_id into run_id from public.answer_revisions
  where tenant_id = new.tenant_id and id = new.answer_revision_id;
  if not exists (
    select 1 from public.generation_candidates candidate
    where candidate.tenant_id = new.tenant_id
      and candidate.generation_run_id = run_id
      and candidate.evidence_span_id = new.evidence_span_id
      and candidate.evidence_version_id = new.evidence_version_id
  ) then
    raise exception using errcode = '23514', message = 'Citation span was not part of the immutable generation candidate set';
  end if;
  select evidence_version_id into span_version from public.evidence_spans
  where tenant_id = new.tenant_id and id = new.evidence_span_id;
  if span_version is null or span_version <> new.evidence_version_id then
    raise exception using errcode = '23514', message = 'Citation span and evidence version do not match';
  end if;
  return new;
end;
$$;

create trigger answer_citations_validate_candidate
before insert on public.answer_citations
for each row execute function public.validate_answer_citation();

create or replace function public.request_answer_generation(
  p_tenant_id uuid,
  p_questionnaire_snapshot_id uuid,
  p_question_id uuid,
  p_operation public.generation_operation,
  p_provider text,
  p_model text,
  p_model_version text,
  p_prompt_version text,
  p_schema_version integer,
  p_correlation_id uuid
)
returns table (generation_run_id uuid, job_id uuid, outbox_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  snapshot_row public.questionnaire_snapshots;
  question_row public.questionnaire_questions;
  existing_run public.generation_runs;
  created_job public.jobs;
  created_run public.generation_runs;
  outbox_row public.generation_queue_outbox;
  idempotency text;
begin
  if not public.has_any_role(
    p_tenant_id,
    array['knowledge_owner', 'contributor', 'security_reviewer']::public.membership_role[]
  ) then
    raise exception using errcode = '42501', message = 'Answer generation permission required';
  end if;
  select * into snapshot_row from public.questionnaire_snapshots
  where tenant_id = p_tenant_id and id = p_questionnaire_snapshot_id
    and status in ('frozen', 'answering')
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Frozen questionnaire snapshot not found'; end if;
  select * into question_row from public.questionnaire_questions
  where tenant_id = p_tenant_id and id = p_question_id
    and mapping_version_id = snapshot_row.mapping_version_id
    and inclusion_status = 'included';
  if not found then raise exception using errcode = '22023', message = 'Question does not belong to the frozen snapshot'; end if;
  if not exists (
    select 1 from public.questionnaire_atomic_requests atomic_request
    where atomic_request.tenant_id = p_tenant_id
      and atomic_request.mapping_version_id = snapshot_row.mapping_version_id
      and atomic_request.question_local_id = question_row.local_id
  ) then
    raise exception using errcode = '22023', message = 'Question has no atomic claim requests';
  end if;
  if p_schema_version < 1 then raise exception using errcode = '22023', message = 'Invalid answer schema version'; end if;

  idempotency := format(
    'generate_answer:%s:%s:%s:%s:%s:%s:%s',
    snapshot_row.id, question_row.id, p_operation, p_provider, p_model,
    coalesce(p_model_version, ''), p_prompt_version
  );
  select * into existing_run from public.generation_runs
  where tenant_id = p_tenant_id and idempotency_key = idempotency;
  if found then
    select * into outbox_row from public.generation_queue_outbox
    where tenant_id = p_tenant_id and generation_run_id = existing_run.id;
    return query select existing_run.id, existing_run.job_id, outbox_row.id;
    return;
  end if;

  insert into public.jobs (
    tenant_id, type, status, idempotency_key, correlation_id, created_by, max_attempts
  ) values (
    p_tenant_id, 'generate_answer', 'pending', idempotency,
    p_correlation_id, auth.uid(), 3
  ) returning * into created_job;

  insert into public.generation_runs (
    tenant_id, questionnaire_snapshot_id, mapping_version_id, question_id,
    job_id, operation, snapshot_hash, requested_scope, provider, model,
    model_version, prompt_version, schema_version, idempotency_key, requested_by
  ) values (
    p_tenant_id, snapshot_row.id, snapshot_row.mapping_version_id, question_row.id,
    created_job.id, p_operation, snapshot_row.snapshot_hash, snapshot_row.target_scope,
    trim(p_provider), trim(p_model), nullif(trim(coalesce(p_model_version, '')), ''),
    trim(p_prompt_version), p_schema_version, idempotency, auth.uid()
  ) returning * into created_run;

  insert into public.generation_queue_outbox (
    tenant_id, job_id, generation_run_id, topic, payload
  ) values (
    p_tenant_id, created_job.id, created_run.id, 'generate_answer',
    jsonb_build_object(
      'version', 1,
      'type', 'generate_answer',
      'tenantId', p_tenant_id,
      'generationRunId', created_run.id,
      'questionnaireSnapshotId', snapshot_row.id,
      'questionId', question_row.id,
      'jobId', created_job.id,
      'correlationId', p_correlation_id
    )
  ) returning * into outbox_row;

  if snapshot_row.status = 'frozen' then
    update public.questionnaire_snapshots set status = 'answering'
    where tenant_id = p_tenant_id and id = snapshot_row.id;
  end if;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'answer.generation_requested', 'generation_run', created_run.id,
    p_correlation_id, jsonb_build_object('question_id', question_row.id, 'operation', p_operation)
  );
  return query select created_run.id, created_job.id, outbox_row.id;
end;
$$;

create or replace function public.persist_generation_input(
  p_tenant_id uuid,
  p_generation_run_id uuid,
  p_input_hash text,
  p_input_snapshot jsonb,
  p_candidates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.generation_runs;
  candidate jsonb;
  candidate_index integer := 0;
begin
  select * into run_row from public.generation_runs
  where tenant_id = p_tenant_id and id = p_generation_run_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Generation run not found'; end if;
  if run_row.status not in ('pending', 'retrieving', 'failed_retryable') then
    raise exception using errcode = '22023', message = 'Generation run cannot accept an input snapshot in its current state';
  end if;
  if p_input_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode = '22023', message = 'Invalid generation input hash'; end if;
  if p_input_snapshot->>'tenantId' <> p_tenant_id::text
    or p_input_snapshot->>'generationRunId' <> run_row.id::text
    or p_input_snapshot->>'questionnaireSnapshotId' <> run_row.questionnaire_snapshot_id::text
    or p_input_snapshot->>'questionId' <> run_row.question_id::text
    or p_input_snapshot->>'snapshotHash' <> run_row.snapshot_hash
  then
    raise exception using errcode = '22023', message = 'Generation input identity does not match the run';
  end if;

  delete from public.generation_candidates
  where tenant_id = p_tenant_id and generation_run_id = run_row.id;
  for candidate in select value from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) loop
    candidate_index := candidate_index + 1;
    insert into public.generation_candidates (
      tenant_id, generation_run_id, evidence_span_id, evidence_version_id,
      retrieval_run_id, candidate_order, candidate_snapshot
    ) values (
      p_tenant_id, run_row.id, (candidate->>'spanId')::uuid,
      (candidate->>'evidenceVersionId')::uuid,
      nullif(candidate->>'retrievalRunId', '')::uuid,
      coalesce((candidate->>'candidateOrder')::integer, candidate_index), candidate
    );
  end loop;

  update public.generation_runs
  set input_hash = p_input_hash,
      input_snapshot = p_input_snapshot,
      status = 'generating',
      started_at = coalesce(started_at, now()),
      failure_code = null,
      failure_detail = null
  where tenant_id = p_tenant_id and id = run_row.id;

  update public.jobs set status = 'running', started_at = coalesce(started_at, now())
  where tenant_id = p_tenant_id and id = run_row.job_id and status in ('pending', 'leased', 'failed_retryable');
end;
$$;

create or replace function public.complete_generation_run(
  p_tenant_id uuid,
  p_generation_run_id uuid,
  p_draft jsonb,
  p_output_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.generation_runs;
  question_row public.questionnaire_questions;
  revision_row public.answer_revisions;
  claim_row public.answer_claims;
  atomic_row public.questionnaire_atomic_requests;
  claim jsonb;
  citation jsonb;
  validation_passed boolean;
  draft_state public.answer_state;
begin
  select * into run_row from public.generation_runs
  where tenant_id = p_tenant_id and id = p_generation_run_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Generation run not found'; end if;
  if run_row.input_hash is null or run_row.input_snapshot is null then
    raise exception using errcode = '22023', message = 'Immutable generation input is required before completion';
  end if;
  if p_output_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode = '22023', message = 'Invalid generation output hash'; end if;
  if exists (
    select 1 from public.answer_revisions revision
    where revision.tenant_id = p_tenant_id and revision.generation_run_id = run_row.id
  ) then
    select * into revision_row from public.answer_revisions
    where tenant_id = p_tenant_id and generation_run_id = run_row.id;
    if revision_row.output_hash <> p_output_hash then
      raise exception using errcode = '23505', message = 'Generation run already completed with a different output';
    end if;
    return revision_row.id;
  end if;
  if p_draft->>'tenantId' <> p_tenant_id::text
    or p_draft->>'generationRunId' <> run_row.id::text
    or p_draft->>'questionnaireSnapshotId' <> run_row.questionnaire_snapshot_id::text
    or p_draft->>'questionId' <> run_row.question_id::text
  then
    raise exception using errcode = '22023', message = 'Draft identity does not match the generation run';
  end if;
  validation_passed := coalesce((p_draft->'deterministicValidation'->>'passed')::boolean, false);
  draft_state := (p_draft->>'state')::public.answer_state;
  if not validation_passed and (
    draft_state <> 'blocked_from_automation'
    or nullif(p_draft->>'outwardValue', '') is not null
    or coalesce(p_draft->>'outwardText', '') <> ''
  ) then
    raise exception using errcode = '23514', message = 'Invalid model output must fail closed without an outward answer';
  end if;

  insert into public.answer_revisions (
    tenant_id, generation_run_id, questionnaire_snapshot_id, question_id,
    state, outward_value, outward_text, confidence, risk_tier,
    required_reviewers, limitations, contradictions, missing_information,
    model_identity, validation_result, generation_input_hash, output_hash
  ) values (
    p_tenant_id, run_row.id, run_row.questionnaire_snapshot_id, run_row.question_id,
    draft_state, nullif(p_draft->>'outwardValue', ''), coalesce(p_draft->>'outwardText', ''),
    p_draft->'confidence', (p_draft->>'riskTier')::public.answer_risk_tier,
    array(select jsonb_array_elements_text(coalesce(p_draft->'requiredReviewers', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_draft->'limitations', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_draft->'contradictions', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_draft->'missingInformation', '[]'::jsonb))),
    p_draft->'model', p_draft->'deterministicValidation', run_row.input_hash, p_output_hash
  ) returning * into revision_row;

  select * into question_row from public.questionnaire_questions
  where tenant_id = p_tenant_id and id = run_row.question_id;

  for claim in select value from jsonb_array_elements(coalesce(p_draft->'claims', '[]'::jsonb)) loop
    select * into atomic_row from public.questionnaire_atomic_requests
    where tenant_id = p_tenant_id
      and mapping_version_id = run_row.mapping_version_id
      and question_local_id = question_row.local_id
      and local_id = claim->>'claimLocalId';
    if not found then
      raise exception using errcode = '23514', message = 'Draft contains a claim outside the frozen atomic request set';
    end if;
    insert into public.answer_claims (
      tenant_id, answer_revision_id, atomic_request_id, claim_local_id,
      original_clause, normalized_claim, qualifiers, materiality,
      disposition, proposed_statement, reasons, missing_information
    ) values (
      p_tenant_id, revision_row.id, atomic_row.id, claim->>'claimLocalId',
      claim->>'originalClause', claim->>'normalizedClaim',
      array(select jsonb_array_elements_text(coalesce(claim->'qualifiers', '[]'::jsonb))),
      claim->>'materiality', (claim->>'disposition')::public.claim_disposition,
      coalesce(claim->>'proposedStatement', ''),
      array(select jsonb_array_elements_text(coalesce(claim->'reasons', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(claim->'missingInformation', '[]'::jsonb)))
    ) returning * into claim_row;

    for citation in select value from jsonb_array_elements(coalesce(claim->'citations', '[]'::jsonb)) loop
      insert into public.answer_citations (
        tenant_id, answer_revision_id, answer_claim_id, evidence_span_id,
        evidence_version_id, citation_role, quote
      ) values (
        p_tenant_id, revision_row.id, claim_row.id,
        (citation->>'spanId')::uuid, (citation->>'evidenceVersionId')::uuid,
        (citation->>'role')::public.answer_citation_role, citation->>'quote'
      );
    end loop;
  end loop;

  update public.generation_runs
  set status = case when validation_passed then 'succeeded'::public.generation_status else 'blocked'::public.generation_status end,
      output_hash = p_output_hash,
      validation_result = p_draft->'deterministicValidation',
      completed_at = now(), failure_code = null, failure_detail = null
  where tenant_id = p_tenant_id and id = run_row.id;

  update public.jobs
  set status = 'succeeded', completed_at = now(), lease_owner = null, lease_expires_at = null,
      last_error_code = null, last_error_detail = null
  where tenant_id = p_tenant_id and id = run_row.job_id;

  insert into public.audit_events (
    tenant_id, actor_type, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'service', 'answer.generation_completed', 'answer_revision', revision_row.id,
    run_row.id, jsonb_build_object('generation_run_id', run_row.id, 'state', draft_state, 'validation_passed', validation_passed)
  );
  return revision_row.id;
end;
$$;

create or replace function public.fail_generation_run(
  p_tenant_id uuid,
  p_generation_run_id uuid,
  p_error_code text,
  p_error_detail text,
  p_retryable boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.generation_runs;
begin
  select * into run_row from public.generation_runs
  where tenant_id = p_tenant_id and id = p_generation_run_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Generation run not found'; end if;
  if run_row.status in ('succeeded', 'blocked', 'failed_terminal', 'cancelled') then return; end if;
  update public.generation_runs
  set status = case when p_retryable then 'failed_retryable' else 'failed_terminal' end,
      failure_code = left(p_error_code, 160),
      failure_detail = left(p_error_detail, 1000),
      failed_at = now()
  where tenant_id = p_tenant_id and id = run_row.id;
  update public.jobs
  set status = case when p_retryable then 'failed_retryable' else 'failed_terminal' end,
      last_error_code = left(p_error_code, 160),
      last_error_detail = left(p_error_detail, 1000),
      failed_at = now(), lease_owner = null, lease_expires_at = null
  where tenant_id = p_tenant_id and id = run_row.job_id;
end;
$$;
