create or replace function public.create_evidence_document(
  p_tenant_id uuid,
  p_stored_object_id uuid,
  p_title text,
  p_source_type text,
  p_evidence_class public.evidence_class,
  p_confidentiality public.evidence_confidentiality,
  p_disclosure_policy public.evidence_disclosure_policy,
  p_version_label text,
  p_scope jsonb,
  p_effective_from date,
  p_effective_until date,
  p_review_due_at date
)
returns table (evidence_document_id uuid, evidence_version_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  object public.stored_objects;
  scope_row public.evidence_scopes;
  document_row public.evidence_documents;
  version_row public.evidence_versions;
begin
  if not public.has_any_role(p_tenant_id, array['knowledge_owner']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Knowledge owner role required';
  end if;
  select * into object from public.stored_objects
    where tenant_id = p_tenant_id and id = p_stored_object_id and status = 'accepted' for update;
  if not found then raise exception using errcode = '22023', message = 'An accepted immutable object is required'; end if;

  insert into public.evidence_scopes (
    tenant_id, mode, legal_entities, business_units, products, product_version_expression,
    environments, regions, data_classes, deployment_models, customer_segments,
    effective_from, effective_until, custom_dimensions, created_by
  ) values (
    p_tenant_id,
    coalesce((p_scope->>'mode')::public.scope_mode, 'unknown'),
    array(select jsonb_array_elements_text(coalesce(p_scope->'legalEntities', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_scope->'businessUnits', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_scope->'products', '[]'::jsonb))),
    nullif(p_scope->>'productVersionExpression', ''),
    array(select jsonb_array_elements_text(coalesce(p_scope->'environments', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_scope->'regions', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_scope->'dataClasses', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_scope->'deploymentModels', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_scope->'customerSegments', '[]'::jsonb))),
    p_effective_from,
    p_effective_until,
    coalesce(p_scope->'customDimensions', '{}'::jsonb),
    auth.uid()
  ) returning * into scope_row;

  insert into public.evidence_documents (
    tenant_id, title, source_type, evidence_class, owner_user_id,
    confidentiality, disclosure_policy, scope_id, lifecycle_status, created_by
  ) values (
    p_tenant_id, trim(p_title), trim(p_source_type), p_evidence_class, auth.uid(),
    p_confidentiality, p_disclosure_policy, scope_row.id, 'draft', auth.uid()
  ) returning * into document_row;

  insert into public.evidence_versions (
    tenant_id, evidence_document_id, stored_object_id, scope_id, version_label,
    source_sha256, effective_from, effective_until, review_due_at,
    lifecycle_status, extraction_status, malware_scan_status, created_by
  ) values (
    p_tenant_id, document_row.id, object.id, scope_row.id, trim(p_version_label),
    object.sha256, p_effective_from, p_effective_until, p_review_due_at,
    'draft', 'not_started', object.malware_scan_status, auth.uid()
  ) returning * into version_row;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'evidence.document_created', 'evidence_document', document_row.id,
    gen_random_uuid(), jsonb_build_object('version_id', version_row.id, 'stored_object_id', object.id)
  );
  return query select document_row.id, version_row.id;
end;
$$;

create or replace function public.start_evidence_extraction(
  p_tenant_id uuid,
  p_evidence_version_id uuid,
  p_correlation_id uuid
)
returns table (job_id uuid, outbox_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  version_row public.evidence_versions;
  object_row public.stored_objects;
  created_job public.jobs;
  outbox_row public.evidence_queue_outbox;
  idempotency text;
begin
  if not public.has_any_role(p_tenant_id, array['knowledge_owner']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Knowledge owner role required';
  end if;
  select * into version_row from public.evidence_versions
    where tenant_id = p_tenant_id and id = p_evidence_version_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Evidence version not found'; end if;
  select * into object_row from public.stored_objects
    where tenant_id = p_tenant_id and id = version_row.stored_object_id and status = 'accepted';
  if not found then raise exception using errcode = '22023', message = 'Source object is not accepted'; end if;
  if version_row.lifecycle_status in ('approved', 'approved_restricted', 'superseded', 'retired', 'deleted') then
    raise exception using errcode = '22023', message = 'This evidence version cannot be reprocessed in place';
  end if;

  idempotency := format('extract_evidence:%s:%s:%s', version_row.id, object_row.sha256, 'phase3-v1');
  select * into created_job from public.jobs where tenant_id = p_tenant_id and idempotency_key = idempotency;
  if not found then
    insert into public.jobs (
      tenant_id, type, status, object_id, idempotency_key, correlation_id, created_by, max_attempts
    ) values (
      p_tenant_id, 'extract_evidence', 'pending', object_row.id, idempotency, p_correlation_id, auth.uid(), 3
    ) returning * into created_job;
    update public.evidence_versions set extraction_status = 'pending', lifecycle_status = 'draft'
      where tenant_id = p_tenant_id and id = version_row.id;
  end if;

  insert into public.evidence_queue_outbox (tenant_id, job_id, evidence_version_id, payload)
  values (
    p_tenant_id, created_job.id, version_row.id,
    jsonb_build_object('version', 1, 'type', 'extract_evidence', 'tenantId', p_tenant_id,
      'evidenceVersionId', version_row.id, 'objectId', object_row.id,
      'jobId', created_job.id, 'correlationId', p_correlation_id)
  )
  on conflict (tenant_id, job_id) do update set available_at = now(), dispatched_at = null
  returning * into outbox_row;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'evidence.extraction_requested', 'evidence_version', version_row.id,
    p_correlation_id, jsonb_build_object('job_id', created_job.id)
  );
  return query select created_job.id, outbox_row.id;
end;
$$;

create or replace function public.complete_evidence_extraction(
  p_tenant_id uuid,
  p_evidence_version_id uuid,
  p_job_id uuid,
  p_manifest jsonb,
  p_spans jsonb,
  p_manifest_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  version_row public.evidence_versions;
  run_row public.extraction_runs;
  node jsonb;
  warning jsonb;
  span jsonb;
  critical_count integer;
  quality numeric;
begin
  select * into version_row from public.evidence_versions
    where tenant_id = p_tenant_id and id = p_evidence_version_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Evidence version not found'; end if;
  if p_manifest->>'sourceSha256' <> version_row.source_sha256 then
    raise exception using errcode = '22023', message = 'Manifest source hash mismatch';
  end if;
  quality := (p_manifest->'quality'->>'overall')::numeric;

  insert into public.extraction_runs (
    tenant_id, evidence_version_id, job_id, status, source_sha256,
    extractor_name, extractor_version, normalization_ruleset_version,
    manifest_hash, quality, statistics, started_at, completed_at
  ) values (
    p_tenant_id, version_row.id, p_job_id, 'succeeded', version_row.source_sha256,
    p_manifest->>'extractorName', p_manifest->>'extractorVersion', p_manifest->>'normalizationRulesetVersion',
    p_manifest_hash, p_manifest->'quality', p_manifest->'statistics',
    (p_manifest->>'startedAt')::timestamptz, (p_manifest->>'completedAt')::timestamptz
  )
  on conflict (tenant_id, evidence_version_id, source_sha256, extractor_name, extractor_version, normalization_ruleset_version)
  do update set manifest_hash = excluded.manifest_hash, quality = excluded.quality,
    statistics = excluded.statistics, completed_at = excluded.completed_at, status = 'succeeded'
  returning * into run_row;

  delete from public.extraction_nodes where tenant_id = p_tenant_id and extraction_run_id = run_row.id;
  delete from public.extraction_warnings where tenant_id = p_tenant_id and extraction_run_id = run_row.id;
  delete from public.evidence_spans where tenant_id = p_tenant_id and extraction_run_id = run_row.id;

  for node in select value from jsonb_array_elements(coalesce(p_manifest->'nodes', '[]'::jsonb)) loop
    insert into public.extraction_nodes (
      tenant_id, extraction_run_id, evidence_version_id, local_id, parent_local_id,
      node_type, display_order, text_content, normalized_text, page_number, sheet_name,
      cell_range, heading_path, paragraph_index, character_start, character_end,
      bounding_box, extraction_method, extraction_confidence, flags, metadata, content_hash
    ) values (
      p_tenant_id, run_row.id, version_row.id, node->>'id', nullif(node->>'parentId', ''),
      node->>'type', (node->>'displayOrder')::integer, coalesce(node->>'text', ''), coalesce(node->>'normalizedText', ''),
      nullif(node->>'pageNumber', '')::integer, nullif(node->>'sheetName', ''), nullif(node->>'cellRange', ''),
      array(select jsonb_array_elements_text(coalesce(node->'headingPath', '[]'::jsonb))),
      nullif(node->>'paragraphIndex', '')::integer, nullif(node->>'characterStart', '')::integer,
      nullif(node->>'characterEnd', '')::integer, node->'boundingBox', (node->>'extractionMethod')::public.extraction_method,
      (node->>'extractionConfidence')::numeric,
      array(select jsonb_array_elements_text(coalesce(node->'flags', '[]'::jsonb))),
      coalesce(node->'metadata', '{}'::jsonb), encode(extensions.digest(coalesce(node->>'normalizedText', ''), 'sha256'), 'hex')
    );
  end loop;

  for warning in select value from jsonb_array_elements(coalesce(p_manifest->'warnings', '[]'::jsonb)) loop
    insert into public.extraction_warnings (
      tenant_id, extraction_run_id, evidence_version_id, code, severity, message,
      node_local_id, page_number, sheet_name, metadata
    ) values (
      p_tenant_id, run_row.id, version_row.id, warning->>'code', warning->>'severity', warning->>'message',
      nullif(warning->>'nodeId', ''), nullif(warning->>'pageNumber', '')::integer,
      nullif(warning->>'sheetName', ''), coalesce(warning->'metadata', '{}'::jsonb)
    );
  end loop;

  for span in select value from jsonb_array_elements(coalesce(p_spans, '[]'::jsonb)) loop
    insert into public.evidence_spans (
      tenant_id, evidence_version_id, extraction_run_id, local_id, source_node_local_ids,
      text_content, normalized_text, page_number, sheet_name, cell_range, heading_path,
      extraction_method, extraction_confidence, source_location, content_hash
    ) values (
      p_tenant_id, version_row.id, run_row.id, span->>'localId',
      array(select jsonb_array_elements_text(span->'sourceNodeIds')),
      span->>'text', span->>'normalizedText', nullif(span->>'pageNumber', '')::integer,
      nullif(span->>'sheetName', ''), nullif(span->>'cellRange', ''),
      array(select jsonb_array_elements_text(coalesce(span->'headingPath', '[]'::jsonb))),
      (span->>'extractionMethod')::public.extraction_method, (span->>'extractionConfidence')::numeric,
      span->'sourceLocation', span->>'contentHash'
    );
  end loop;

  select count(*) into critical_count from public.extraction_warnings
    where tenant_id = p_tenant_id and extraction_run_id = run_row.id and severity = 'critical' and resolved_at is null;

  update public.evidence_versions set
    extraction_status = 'succeeded',
    index_status = case when critical_count = 0 then 'ready' else 'not_indexed' end,
    lifecycle_status = case when critical_count = 0 and quality >= 0.82 then 'ready_for_review' else 'extraction_review_required' end,
    malware_scan_status = (p_manifest->>'scanStatus')::public.malware_scan_status,
    extraction_quality = quality,
    extractor_name = p_manifest->>'extractorName',
    extractor_version = p_manifest->>'extractorVersion',
    normalization_ruleset_version = p_manifest->>'normalizationRulesetVersion',
    manifest_hash = p_manifest_hash
  where tenant_id = p_tenant_id and id = version_row.id;

  update public.stored_objects set malware_scan_status = (p_manifest->>'scanStatus')::public.malware_scan_status
    where tenant_id = p_tenant_id and id = version_row.stored_object_id;

  insert into public.audit_events (
    tenant_id, actor_type, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'service', 'evidence.extraction_completed', 'evidence_version', version_row.id,
    gen_random_uuid(), jsonb_build_object('run_id', run_row.id, 'quality', quality,
      'span_count', jsonb_array_length(coalesce(p_spans, '[]'::jsonb)), 'critical_warning_count', critical_count)
  );
  return run_row.id;
end;
$$;

create or replace function public.approve_evidence_version(
  p_tenant_id uuid,
  p_evidence_version_id uuid,
  p_rationale text,
  p_restricted boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  version_row public.evidence_versions;
  document_row public.evidence_documents;
  unresolved_critical integer;
begin
  if not public.has_any_role(p_tenant_id, array['knowledge_owner']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Knowledge owner role required';
  end if;
  select * into version_row from public.evidence_versions
    where tenant_id = p_tenant_id and id = p_evidence_version_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Evidence version not found'; end if;
  select * into document_row from public.evidence_documents
    where tenant_id = p_tenant_id and id = version_row.evidence_document_id for update;
  select count(*) into unresolved_critical from public.extraction_warnings warning
    where warning.tenant_id = p_tenant_id and warning.evidence_version_id = version_row.id
      and warning.severity = 'critical' and warning.resolved_at is null;
  if version_row.extraction_status <> 'succeeded' or version_row.extraction_quality < 0.82 then
    raise exception using errcode = '22023', message = 'Extraction quality is insufficient for approval';
  end if;
  if version_row.malware_scan_status <> 'clean' then
    raise exception using errcode = '22023', message = 'A clean malware scan is required for approval';
  end if;
  if unresolved_critical > 0 then
    raise exception using errcode = '22023', message = 'Critical extraction warnings must be resolved';
  end if;
  if version_row.review_due_at is null or version_row.effective_from is null then
    raise exception using errcode = '22023', message = 'Effective and review dates are required';
  end if;

  if document_row.current_version_id is not null and document_row.current_version_id <> version_row.id then
    update public.evidence_versions set lifecycle_status = 'superseded'
      where tenant_id = p_tenant_id and id = document_row.current_version_id;
  end if;
  update public.evidence_versions set
    lifecycle_status = case when p_restricted then 'approved_restricted' else 'approved' end,
    approved_by = auth.uid(), approved_at = now(), index_status = 'ready'
  where tenant_id = p_tenant_id and id = version_row.id;
  update public.evidence_documents set
    current_version_id = version_row.id,
    lifecycle_status = case when p_restricted then 'approved_restricted' else 'approved' end
  where tenant_id = p_tenant_id and id = document_row.id;
  insert into public.evidence_approvals (
    tenant_id, evidence_version_id, decision, rationale, approved_scope_id, decided_by
  ) values (p_tenant_id, version_row.id, 'approved', trim(p_rationale), version_row.scope_id, auth.uid());
  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'evidence.version_approved', 'evidence_version', version_row.id,
    gen_random_uuid(), jsonb_build_object('restricted', p_restricted, 'document_id', document_row.id)
  );
end;
$$;
