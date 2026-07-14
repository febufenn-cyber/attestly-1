-- Phase 5 generation runtime support: service retrieval, retry-safe input persistence,
-- provider usage, and cancellation.

create table public.generation_provider_usage (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  generation_run_id uuid not null,
  provider text not null check (char_length(provider) between 1 and 120),
  model text not null check (char_length(model) between 1 and 200),
  provider_request_id text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  attempt integer not null check (attempt > 0),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, generation_run_id, attempt),
  constraint generation_provider_usage_run_fk foreign key (tenant_id, generation_run_id)
    references public.generation_runs(tenant_id, id) on delete cascade
);

create index generation_provider_usage_run_idx
  on public.generation_provider_usage(tenant_id, generation_run_id, attempt);

create or replace function public.protect_generation_usage()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception using errcode = '42501', message = 'Generation usage records are append-only';
end;
$$;

create trigger generation_provider_usage_append_only
before update or delete on public.generation_provider_usage
for each row execute function public.protect_generation_usage();

create or replace function public.search_evidence_for_generation(
  p_tenant_id uuid,
  p_generation_run_id uuid,
  p_query text,
  p_limit integer default 12
)
returns table (
  retrieval_run_id uuid,
  span_id uuid,
  evidence_version_id uuid,
  document_title text,
  version_label text,
  evidence_class public.evidence_class,
  disclosure_policy public.evidence_disclosure_policy,
  text_content text,
  normalized_text text,
  page_number integer,
  sheet_name text,
  cell_range text,
  heading_path text[],
  extraction_confidence numeric,
  extraction_quality numeric,
  scope_match public.scope_match_result,
  authority_score numeric,
  freshness_score numeric,
  final_rank numeric,
  historical boolean,
  contradiction_count bigint
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  run_row public.generation_runs;
  requester_role public.membership_role;
  retrieval_row public.retrieval_runs;
  query_value tsquery;
  retrieval_operation text;
begin
  select * into run_row from public.generation_runs
  where tenant_id = p_tenant_id and id = p_generation_run_id;
  if not found then raise exception using errcode = 'P0002', message = 'Generation run not found'; end if;
  if run_row.status in ('succeeded', 'blocked', 'failed_terminal', 'cancelled') then
    raise exception using errcode = '22023', message = 'Terminal generation run cannot retrieve evidence';
  end if;
  select role into requester_role from public.organization_memberships
  where tenant_id = p_tenant_id and user_id = run_row.requested_by and status = 'active';
  if not found then raise exception using errcode = '42501', message = 'Generation requester is no longer an active workspace member'; end if;
  if char_length(trim(p_query)) < 2 or p_limit not between 1 and 30 then
    raise exception using errcode = '22023', message = 'Invalid generation retrieval query or limit';
  end if;

  retrieval_operation := case run_row.operation
    when 'external_quote_draft' then 'external_quote'
    when 'external_summary_draft' then 'external_summary'
    else 'internal_answer_support'
  end;
  insert into public.retrieval_runs (tenant_id, actor_user_id, query_text, requested_scope, operation, include_historical)
  values (p_tenant_id, run_row.requested_by, trim(p_query), run_row.requested_scope, retrieval_operation, true)
  returning * into retrieval_row;
  query_value := websearch_to_tsquery('english', trim(p_query));

  with eligible as (
    select span.id span_id, span.evidence_version_id, document.title document_title,
      version.version_label, document.evidence_class, document.disclosure_policy,
      span.text_content, span.normalized_text, span.page_number, span.sheet_name,
      span.cell_range, span.heading_path, span.extraction_confidence,
      coalesce(version.extraction_quality, 0)::numeric extraction_quality,
      public.evidence_scope_match(run_row.requested_scope, scope) scope_match,
      public.evidence_authority_score(document.evidence_class) authority_score,
      case when version.effective_until is not null and version.effective_until < current_date then 0.0
        when version.review_due_at is not null and version.review_due_at < current_date then 0.25
        else 1.0 end::numeric freshness_score,
      greatest(ts_rank_cd(span.search_document, query_value), similarity(span.normalized_text, lower(trim(p_query))))::numeric keyword_score,
      version.lifecycle_status = 'superseded' historical,
      (select count(*) from public.evidence_relations relation
       where relation.tenant_id = p_tenant_id and relation.approved
         and relation.relation_type = 'contradicts'
         and (relation.source_version_id = version.id or relation.target_version_id = version.id)) contradiction_count
    from public.evidence_spans span
    join public.evidence_versions version on version.tenant_id = span.tenant_id and version.id = span.evidence_version_id
    join public.evidence_documents document on document.tenant_id = version.tenant_id and document.id = version.evidence_document_id
    join public.evidence_scopes scope on scope.tenant_id = version.tenant_id and scope.id = version.scope_id
    where span.tenant_id = p_tenant_id
      and version.extraction_status = 'succeeded' and version.index_status = 'ready'
      and version.lifecycle_status in ('approved', 'approved_restricted', 'superseded')
      and document.lifecycle_status not in ('retired', 'deletion_requested', 'deleted')
      and (document.confidentiality <> 'restricted' or requester_role = any(array['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]))
      and case run_row.operation
        when 'external_quote_draft' then document.disclosure_policy = 'external_quote_allowed'
        when 'external_summary_draft' then document.disclosure_policy in ('external_quote_allowed', 'external_summary_only')
        else document.disclosure_policy <> 'prohibited' end
      and (span.search_document @@ query_value or similarity(span.normalized_text, lower(trim(p_query))) > 0.08)
  ), ranked as (
    select eligible.*,
      ((case eligible.scope_match when 'mismatch' then 0 when 'unknown' then 0.25 when 'partial' then 0.55 when 'compatible' then 0.9 else 1 end)
       * case when eligible.historical then 0.45 else 1 end
       * (eligible.keyword_score * 0.45 + eligible.authority_score * 0.2 + eligible.freshness_score * 0.15 + eligible.extraction_quality * 0.2))::numeric final_rank
    from eligible
  ), selected as (
    select * from ranked where ranked.scope_match <> 'mismatch' and ranked.final_rank > 0
    order by ranked.final_rank desc, ranked.span_id limit p_limit
  )
  insert into public.retrieval_candidates (tenant_id, retrieval_run_id, evidence_span_id, keyword_score, scope_match, authority_score, freshness_score, extraction_quality, final_rank, selected)
  select p_tenant_id, retrieval_row.id, selected.span_id, selected.keyword_score, selected.scope_match,
    selected.authority_score, selected.freshness_score, selected.extraction_quality, selected.final_rank, true
  from selected;

  return query
  select retrieval_row.id, candidate.evidence_span_id, span.evidence_version_id,
    document.title, version.version_label, document.evidence_class, document.disclosure_policy,
    span.text_content, span.normalized_text, span.page_number, span.sheet_name, span.cell_range,
    span.heading_path, span.extraction_confidence, coalesce(version.extraction_quality, 0)::numeric,
    candidate.scope_match, candidate.authority_score, candidate.freshness_score, candidate.final_rank,
    version.lifecycle_status = 'superseded',
    (select count(*) from public.evidence_relations relation
     where relation.tenant_id = p_tenant_id and relation.approved and relation.relation_type = 'contradicts'
       and (relation.source_version_id = version.id or relation.target_version_id = version.id))
  from public.retrieval_candidates candidate
  join public.evidence_spans span on span.tenant_id = candidate.tenant_id and span.id = candidate.evidence_span_id
  join public.evidence_versions version on version.tenant_id = span.tenant_id and version.id = span.evidence_version_id
  join public.evidence_documents document on document.tenant_id = version.tenant_id and document.id = version.evidence_document_id
  where candidate.tenant_id = p_tenant_id and candidate.retrieval_run_id = retrieval_row.id
  order by candidate.final_rank desc, candidate.evidence_span_id;
end;
$$;

create or replace function public.persist_generation_input(p_tenant_id uuid, p_generation_run_id uuid, p_input_hash text, p_input_snapshot jsonb, p_candidates jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare run_row public.generation_runs; candidate jsonb; candidate_index integer := 0;
begin
  select * into run_row from public.generation_runs where tenant_id = p_tenant_id and id = p_generation_run_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Generation run not found'; end if;
  if run_row.status not in ('pending', 'retrieving', 'generating', 'failed_retryable') then raise exception using errcode = '22023', message = 'Generation run cannot accept an input snapshot in its current state'; end if;
  if p_input_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode = '22023', message = 'Invalid generation input hash'; end if;
  if p_input_snapshot->>'tenantId' <> p_tenant_id::text or p_input_snapshot->>'generationRunId' <> run_row.id::text
    or p_input_snapshot->>'questionnaireSnapshotId' <> run_row.questionnaire_snapshot_id::text
    or p_input_snapshot->>'questionId' <> run_row.question_id::text or p_input_snapshot->>'snapshotHash' <> run_row.snapshot_hash
  then raise exception using errcode = '22023', message = 'Generation input identity does not match the run'; end if;
  if run_row.input_hash is not null then
    if run_row.input_hash <> p_input_hash or run_row.input_snapshot <> p_input_snapshot then raise exception using errcode = '23505', message = 'Generation retry input does not match the immutable snapshot'; end if;
  else
    for candidate in select value from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) loop
      candidate_index := candidate_index + 1;
      insert into public.generation_candidates (tenant_id, generation_run_id, evidence_span_id, evidence_version_id, retrieval_run_id, candidate_order, candidate_snapshot)
      values (p_tenant_id, run_row.id, (candidate->>'spanId')::uuid, (candidate->>'evidenceVersionId')::uuid,
        nullif(candidate->>'retrievalRunId', '')::uuid, coalesce((candidate->>'candidateOrder')::integer, candidate_index), candidate);
    end loop;
    update public.generation_runs set input_hash = p_input_hash, input_snapshot = p_input_snapshot where tenant_id = p_tenant_id and id = run_row.id;
  end if;
  update public.generation_runs set status = 'generating', started_at = coalesce(started_at, now()), failure_code = null, failure_detail = null, failed_at = null where tenant_id = p_tenant_id and id = run_row.id;
  update public.jobs set status = 'running', started_at = coalesce(started_at, now()), last_error_code = null, last_error_detail = null, failed_at = null
  where tenant_id = p_tenant_id and id = run_row.job_id and status in ('pending', 'leased', 'running', 'failed_retryable');
end;
$$;

create or replace function public.record_generation_usage(p_tenant_id uuid, p_generation_run_id uuid, p_usage jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare usage_row public.generation_provider_usage;
begin
  if not exists (select 1 from public.generation_runs where tenant_id = p_tenant_id and id = p_generation_run_id) then raise exception using errcode = 'P0002', message = 'Generation run not found'; end if;
  insert into public.generation_provider_usage (tenant_id, generation_run_id, provider, model, provider_request_id, input_tokens, output_tokens, latency_ms, cost_micro_usd, attempt)
  values (p_tenant_id, p_generation_run_id, p_usage->>'provider', p_usage->>'model', nullif(p_usage->>'providerRequestId', ''),
    coalesce((p_usage->>'inputTokens')::integer, 0), coalesce((p_usage->>'outputTokens')::integer, 0),
    coalesce((p_usage->>'latencyMs')::integer, 0), coalesce((p_usage->>'costMicroUsd')::bigint, 0), (p_usage->>'attempt')::integer)
  on conflict (tenant_id, generation_run_id, attempt) do nothing returning * into usage_row;
  if usage_row.id is null then select * into usage_row from public.generation_provider_usage where tenant_id = p_tenant_id and generation_run_id = p_generation_run_id and attempt = (p_usage->>'attempt')::integer; end if;
  return usage_row.id;
end;
$$;

create or replace function public.cancel_generation_run(p_tenant_id uuid, p_generation_run_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare run_row public.generation_runs;
begin
  select * into run_row from public.generation_runs where tenant_id = p_tenant_id and id = p_generation_run_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Generation run not found'; end if;
  if run_row.requested_by <> auth.uid() and not public.has_any_role(p_tenant_id, array['knowledge_owner', 'security_reviewer']::public.membership_role[]) then raise exception using errcode = '42501', message = 'Generation cancellation permission required'; end if;
  if run_row.status in ('succeeded', 'blocked', 'failed_terminal', 'cancelled') then return; end if;
  update public.generation_runs set status = 'cancelled', completed_at = now(), failure_code = 'cancelled_by_user', failure_detail = null where tenant_id = p_tenant_id and id = run_row.id;
  update public.jobs set status = 'cancelled', completed_at = now(), lease_owner = null, lease_expires_at = null, last_error_code = 'cancelled_by_user', last_error_detail = null where tenant_id = p_tenant_id and id = run_row.job_id;
  insert into public.audit_events (tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata)
  values (p_tenant_id, 'user', auth.uid(), 'answer.generation_cancelled', 'generation_run', run_row.id, gen_random_uuid(), '{}'::jsonb);
end;
$$;

alter table public.generation_provider_usage enable row level security;
create policy generation_provider_usage_authorized_select on public.generation_provider_usage
for select to authenticated using (exists (select 1 from public.generation_runs run where run.tenant_id = generation_provider_usage.tenant_id and run.id = generation_provider_usage.generation_run_id and (run.requested_by = auth.uid() or public.has_any_role(run.tenant_id, array['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]))));

revoke all on public.generation_provider_usage from anon, authenticated;
grant select on public.generation_provider_usage to authenticated;
revoke all on function public.search_evidence_for_generation(uuid, uuid, text, integer) from public;
revoke all on function public.persist_generation_input(uuid, uuid, text, jsonb, jsonb) from public;
revoke all on function public.record_generation_usage(uuid, uuid, jsonb) from public;
revoke all on function public.cancel_generation_run(uuid, uuid) from public;
grant execute on function public.search_evidence_for_generation(uuid, uuid, text, integer) to service_role;
grant execute on function public.persist_generation_input(uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.record_generation_usage(uuid, uuid, jsonb) to service_role;
grant execute on function public.cancel_generation_run(uuid, uuid) to authenticated;
