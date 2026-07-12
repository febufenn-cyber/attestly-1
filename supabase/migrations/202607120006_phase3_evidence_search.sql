create or replace function public.search_evidence(
  p_tenant_id uuid,
  p_query text,
  p_requested_scope jsonb,
  p_operation text,
  p_include_historical boolean default false,
  p_limit integer default 10
)
returns table (
  retrieval_run_id uuid,
  span_id uuid,
  evidence_version_id uuid,
  document_title text,
  version_label text,
  evidence_class public.evidence_class,
  confidentiality public.evidence_confidentiality,
  disclosure_policy public.evidence_disclosure_policy,
  text_content text,
  page_number integer,
  sheet_name text,
  cell_range text,
  heading_path text[],
  extraction_confidence numeric,
  scope_match public.scope_match_result,
  keyword_score numeric,
  authority_score numeric,
  freshness_score numeric,
  final_rank numeric,
  contradiction_count bigint
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  run_row public.retrieval_runs;
  query_value tsquery;
begin
  if not public.is_org_member(p_tenant_id) then
    raise exception using errcode = '42501', message = 'Workspace membership required';
  end if;
  if char_length(trim(p_query)) < 2 or p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Invalid search query or limit';
  end if;
  insert into public.retrieval_runs (tenant_id, actor_user_id, query_text, requested_scope, operation, include_historical)
    values (p_tenant_id, auth.uid(), trim(p_query), p_requested_scope, p_operation, p_include_historical)
    returning * into run_row;
  query_value := websearch_to_tsquery('english', trim(p_query));

  with eligible as (
    select
      span.id span_id,
      span.evidence_version_id,
      document.title document_title,
      version.version_label,
      document.evidence_class,
      document.confidentiality,
      document.disclosure_policy,
      span.text_content,
      span.page_number,
      span.sheet_name,
      span.cell_range,
      span.heading_path,
      span.extraction_confidence,
      public.evidence_scope_match(p_requested_scope, scope) scope_match,
      greatest(ts_rank_cd(span.search_document, query_value), similarity(span.normalized_text, lower(trim(p_query))))::numeric keyword_score,
      public.evidence_authority_score(document.evidence_class) authority_score,
      case
        when version.effective_until is not null and version.effective_until < current_date then 0.0
        when version.review_due_at is not null and version.review_due_at < current_date then 0.25
        else 1.0
      end::numeric freshness_score,
      coalesce(version.extraction_quality, 0)::numeric extraction_quality,
      (select count(*) from public.evidence_relations relation
        where relation.tenant_id = p_tenant_id and relation.approved
          and relation.relation_type = 'contradicts'
          and (relation.source_version_id = version.id or relation.target_version_id = version.id)) contradiction_count
    from public.evidence_spans span
    join public.evidence_versions version on version.tenant_id = span.tenant_id and version.id = span.evidence_version_id
    join public.evidence_documents document on document.tenant_id = version.tenant_id and document.id = version.evidence_document_id
    join public.evidence_scopes scope on scope.tenant_id = version.tenant_id and scope.id = version.scope_id
    where span.tenant_id = p_tenant_id
      and public.may_read_evidence_content(document.tenant_id, document.confidentiality)
      and version.extraction_status = 'succeeded'
      and version.index_status = 'ready'
      and (
        version.lifecycle_status in ('approved', 'approved_restricted')
        or (p_include_historical and version.lifecycle_status = 'superseded')
      )
      and document.lifecycle_status not in ('retired', 'deletion_requested', 'deleted')
      and (span.search_document @@ query_value or similarity(span.normalized_text, lower(trim(p_query))) > 0.08)
      and case p_operation
        when 'external_quote' then document.disclosure_policy = 'external_quote_allowed'
        when 'external_summary' then document.disclosure_policy in ('external_quote_allowed', 'external_summary_only')
        else true
      end
  ), ranked as (
    select eligible.*,
      case eligible.scope_match
        when 'mismatch' then 0
        when 'unknown' then (eligible.keyword_score * 0.45 + eligible.authority_score * 0.2 + eligible.freshness_score * 0.15 + eligible.extraction_quality * 0.2) * 0.25
        when 'partial' then (eligible.keyword_score * 0.45 + eligible.authority_score * 0.2 + eligible.freshness_score * 0.15 + eligible.extraction_quality * 0.2) * 0.55
        when 'compatible' then (eligible.keyword_score * 0.45 + eligible.authority_score * 0.2 + eligible.freshness_score * 0.15 + eligible.extraction_quality * 0.2) * 0.9
        else (eligible.keyword_score * 0.45 + eligible.authority_score * 0.2 + eligible.freshness_score * 0.15 + eligible.extraction_quality * 0.2)
      end::numeric final_rank
    from eligible
  ), selected as (
    select * from ranked where ranked.scope_match <> 'mismatch' and ranked.final_rank > 0 order by ranked.final_rank desc, ranked.span_id limit p_limit
  )
  insert into public.retrieval_candidates (
    tenant_id, retrieval_run_id, evidence_span_id, keyword_score, scope_match,
    authority_score, freshness_score, extraction_quality, final_rank, selected
  )
  select p_tenant_id, run_row.id, selected.span_id, selected.keyword_score, selected.scope_match,
    selected.authority_score, selected.freshness_score, selected.extraction_quality, selected.final_rank, true
  from selected;

  return query
  select run_row.id, candidate.evidence_span_id, span.evidence_version_id,
    document.title, version.version_label, document.evidence_class, document.confidentiality,
    document.disclosure_policy, span.text_content, span.page_number, span.sheet_name, span.cell_range,
    span.heading_path, span.extraction_confidence, candidate.scope_match,
    candidate.keyword_score, candidate.authority_score, candidate.freshness_score, candidate.final_rank,
    (select count(*) from public.evidence_relations relation
      where relation.tenant_id = p_tenant_id and relation.approved and relation.relation_type = 'contradicts'
        and (relation.source_version_id = version.id or relation.target_version_id = version.id))
  from public.retrieval_candidates candidate
  join public.evidence_spans span on span.tenant_id = candidate.tenant_id and span.id = candidate.evidence_span_id
  join public.evidence_versions version on version.tenant_id = span.tenant_id and version.id = span.evidence_version_id
  join public.evidence_documents document on document.tenant_id = version.tenant_id and document.id = version.evidence_document_id
  where candidate.tenant_id = p_tenant_id and candidate.retrieval_run_id = run_row.id
  order by candidate.final_rank desc, candidate.evidence_span_id;
end;
$$;
