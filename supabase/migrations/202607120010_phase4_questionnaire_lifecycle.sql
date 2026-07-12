create or replace function public.protect_questionnaire_artifact_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.tenant_id <> old.tenant_id
    or new.id <> old.id
    or new.stored_object_id <> old.stored_object_id
    or new.source_sha256 <> old.source_sha256
    or new.format <> old.format
    or new.created_by <> old.created_by
  then
    raise exception using errcode = '42501', message = 'Questionnaire artifact identity is immutable';
  end if;
  return new;
end;
$$;

create trigger questionnaire_artifacts_protect_identity
before update on public.questionnaire_artifacts
for each row execute function public.protect_questionnaire_artifact_identity();

create or replace function public.prevent_frozen_mapping_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'frozen' then
    raise exception using errcode = '42501', message = 'Frozen questionnaire mappings are immutable';
  end if;
  return new;
end;
$$;

create trigger questionnaire_mappings_prevent_frozen_mutation
before update or delete on public.questionnaire_mapping_versions
for each row execute function public.prevent_frozen_mapping_mutation();

create or replace function public.create_questionnaire_artifact(
  p_tenant_id uuid,
  p_stored_object_id uuid,
  p_format public.questionnaire_format
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  object_row public.stored_objects;
  artifact_row public.questionnaire_artifacts;
begin
  if not public.has_any_role(
    p_tenant_id,
    array['admin', 'knowledge_owner', 'contributor']::public.membership_role[]
  ) then
    raise exception using errcode = '42501', message = 'Questionnaire upload permission required';
  end if;

  select * into object_row
  from public.stored_objects
  where tenant_id = p_tenant_id
    and id = p_stored_object_id
    and status = 'accepted'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'An accepted immutable object is required';
  end if;
  if object_row.sha256 is null then
    raise exception using errcode = '22023', message = 'Questionnaire source hash is required';
  end if;
  if object_row.malware_scan_status not in ('clean', 'unavailable') then
    raise exception using errcode = '22023', message = 'Questionnaire source has not passed the malware gate';
  end if;

  insert into public.questionnaire_artifacts (
    tenant_id, stored_object_id, source_sha256, format, original_filename, created_by
  ) values (
    p_tenant_id, object_row.id, object_row.sha256, p_format, object_row.file_name, auth.uid()
  )
  on conflict (tenant_id, stored_object_id) do update
    set lifecycle_status = public.questionnaire_artifacts.lifecycle_status
  returning * into artifact_row;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'questionnaire.artifact_created', 'questionnaire_artifact', artifact_row.id,
    gen_random_uuid(), jsonb_build_object('stored_object_id', object_row.id, 'format', p_format)
  );
  return artifact_row.id;
end;
$$;

create or replace function public.start_questionnaire_import(
  p_tenant_id uuid,
  p_questionnaire_artifact_id uuid,
  p_correlation_id uuid
)
returns table (job_id uuid, outbox_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  artifact_row public.questionnaire_artifacts;
  object_row public.stored_objects;
  created_job public.jobs;
  outbox_row public.questionnaire_queue_outbox;
  idempotency text;
begin
  if not public.has_any_role(
    p_tenant_id,
    array['admin', 'knowledge_owner', 'contributor']::public.membership_role[]
  ) then
    raise exception using errcode = '42501', message = 'Questionnaire import permission required';
  end if;

  select * into artifact_row
  from public.questionnaire_artifacts
  where tenant_id = p_tenant_id and id = p_questionnaire_artifact_id and lifecycle_status = 'active'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Questionnaire artifact not found'; end if;

  select * into object_row
  from public.stored_objects
  where tenant_id = p_tenant_id and id = artifact_row.stored_object_id and status = 'accepted';
  if not found or object_row.sha256 <> artifact_row.source_sha256 then
    raise exception using errcode = '22023', message = 'Questionnaire source identity is invalid';
  end if;

  idempotency := format('inspect_questionnaire:%s:%s:%s', artifact_row.id, artifact_row.source_sha256, 'phase4-v1');
  select * into created_job
  from public.jobs
  where tenant_id = p_tenant_id and idempotency_key = idempotency;

  if not found then
    insert into public.jobs (
      tenant_id, type, status, object_id, idempotency_key, correlation_id, created_by, max_attempts
    ) values (
      p_tenant_id, 'inspect_questionnaire', 'pending', object_row.id,
      idempotency, p_correlation_id, auth.uid(), 3
    ) returning * into created_job;
  end if;

  insert into public.questionnaire_queue_outbox (
    tenant_id, job_id, questionnaire_artifact_id, topic, payload
  ) values (
    p_tenant_id, created_job.id, artifact_row.id, 'inspect_questionnaire',
    jsonb_build_object(
      'version', 1,
      'type', 'inspect_questionnaire',
      'tenantId', p_tenant_id,
      'questionnaireArtifactId', artifact_row.id,
      'objectId', object_row.id,
      'jobId', created_job.id,
      'correlationId', p_correlation_id
    )
  )
  on conflict on constraint questionnaire_queue_outbox_job_unique
  do update set available_at = now(), dispatched_at = null, last_error = null
  returning * into outbox_row;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'questionnaire.import_requested', 'questionnaire_artifact', artifact_row.id,
    p_correlation_id, jsonb_build_object('job_id', created_job.id)
  );
  return query select created_job.id, outbox_row.id;
end;
$$;

create or replace function public.complete_questionnaire_import(
  p_tenant_id uuid,
  p_questionnaire_artifact_id uuid,
  p_job_id uuid,
  p_manifest jsonb,
  p_manifest_hash text
)
returns table (import_run_id uuid, mapping_version_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  artifact_row public.questionnaire_artifacts;
  import_row public.questionnaire_import_runs;
  mapping_row public.questionnaire_mapping_versions;
  question jsonb;
  destination jsonb;
  atomic_request jsonb;
  condition jsonb;
  instruction jsonb;
  warning jsonb;
  next_version integer;
begin
  select * into artifact_row
  from public.questionnaire_artifacts
  where tenant_id = p_tenant_id and id = p_questionnaire_artifact_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Questionnaire artifact not found'; end if;
  if p_manifest->>'sourceSha256' <> artifact_row.source_sha256 then
    raise exception using errcode = '22023', message = 'Questionnaire manifest source hash mismatch';
  end if;
  if p_manifest->>'format' <> artifact_row.format::text then
    raise exception using errcode = '22023', message = 'Questionnaire manifest format mismatch';
  end if;

  insert into public.questionnaire_import_runs (
    tenant_id, questionnaire_artifact_id, job_id, status,
    processor_name, processor_version, ruleset_version, source_sha256,
    manifest_hash, structural_fingerprint, compatibility_status,
    compatibility_dimensions, manifest, statistics, started_at, completed_at
  ) values (
    p_tenant_id, artifact_row.id, p_job_id, 'succeeded',
    p_manifest->>'processorName', p_manifest->>'processorVersion', p_manifest->>'rulesetVersion',
    artifact_row.source_sha256, p_manifest_hash, p_manifest->>'structuralFingerprint',
    (p_manifest->>'compatibilityStatus')::public.questionnaire_compatibility_status,
    p_manifest->'compatibilityDimensions', p_manifest, p_manifest->'statistics',
    (p_manifest->>'startedAt')::timestamptz, (p_manifest->>'completedAt')::timestamptz
  ) returning * into import_row;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.questionnaire_mapping_versions
  where tenant_id = p_tenant_id and questionnaire_artifact_id = artifact_row.id;

  insert into public.questionnaire_mapping_versions (
    tenant_id, questionnaire_artifact_id, import_run_id, version_number,
    compatibility_status, source_sha256, structural_fingerprint,
    processor_version, target_scope, created_by
  ) values (
    p_tenant_id, artifact_row.id, import_row.id, next_version,
    import_row.compatibility_status, artifact_row.source_sha256,
    import_row.structural_fingerprint, import_row.processor_version,
    '{"mode":"unknown"}'::jsonb,
    coalesce(import_row.created_by, artifact_row.created_by)
  ) returning * into mapping_row;

  for question in select value from jsonb_array_elements(coalesce(p_manifest->'questions', '[]'::jsonb)) loop
    insert into public.questionnaire_questions (
      tenant_id, mapping_version_id, local_id, section_local_id, parent_local_id,
      external_identifier, original_text, normalized_text, question_type, polarity,
      display_order, source_location, answer_format, inclusion_status,
      mapping_confidence, parser_notes
    ) values (
      p_tenant_id, mapping_row.id, question->>'localId',
      nullif(question->'sectionPath'->>-1, ''), nullif(question->>'parentLocalId', ''),
      nullif(question->>'externalIdentifier', ''), question->>'originalText', question->>'normalizedText',
      (question->>'type')::public.questionnaire_question_type,
      (question->>'polarity')::public.questionnaire_polarity,
      (question->>'displayOrder')::integer, question->'sourceLocation', question->'answerFormat',
      question->>'inclusionStatus', question->'confidence',
      array(select jsonb_array_elements_text(coalesce(question->'parserNotes', '[]'::jsonb)))
    );

    for atomic_request in select value from jsonb_array_elements(coalesce(question->'atomicRequests', '[]'::jsonb)) loop
      insert into public.questionnaire_atomic_requests (
        tenant_id, mapping_version_id, question_local_id, local_id, sequence,
        original_clause, normalized_claim, qualifiers, materiality
      ) values (
        p_tenant_id, mapping_row.id, question->>'localId', atomic_request->>'localId',
        (atomic_request->>'sequence')::integer, atomic_request->>'originalClause',
        atomic_request->>'normalizedClaim',
        array(select jsonb_array_elements_text(coalesce(atomic_request->'qualifiers', '[]'::jsonb))),
        atomic_request->>'materiality'
      );
    end loop;
  end loop;

  for destination in select value from jsonb_array_elements(coalesce(p_manifest->'destinations', '[]'::jsonb)) loop
    insert into public.questionnaire_answer_destinations (
      tenant_id, mapping_version_id, local_id, question_local_id,
      destination_type, source_location, expected_value_type, allowed_values,
      stored_values, formula_present, protected, style_hash, validation_hash, write_strategy
    ) values (
      p_tenant_id, mapping_row.id, destination->>'localId', nullif(destination->>'questionLocalId', ''),
      (destination->>'type')::public.questionnaire_destination_type,
      destination->'location', destination->>'expectedValueType',
      array(select jsonb_array_elements_text(coalesce(destination->'allowedValues', '[]'::jsonb))),
      coalesce(destination->'storedValues', '{}'::jsonb),
      coalesce((destination->>'formulaPresent')::boolean, false),
      coalesce((destination->>'protected')::boolean, false),
      nullif(destination->>'styleHash', ''), nullif(destination->>'validationHash', ''),
      destination->>'writeStrategy'
    );
  end loop;

  for condition in select value from jsonb_array_elements(coalesce(p_manifest->'conditions', '[]'::jsonb)) loop
    insert into public.questionnaire_conditions (
      tenant_id, mapping_version_id, local_id, child_question_local_id,
      original_instruction, expression, parser_confidence, human_confirmed
    ) values (
      p_tenant_id, mapping_row.id, condition->>'localId', condition->>'childQuestionLocalId',
      condition->>'originalInstruction', condition->'expression',
      (condition->>'parserConfidence')::numeric,
      coalesce((condition->>'humanConfirmed')::boolean, false)
    );
  end loop;

  for instruction in select value from jsonb_array_elements(coalesce(p_manifest->'instructions', '[]'::jsonb)) loop
    insert into public.questionnaire_instructions (
      tenant_id, mapping_version_id, local_id, instruction_scope, category,
      instruction_text, source_location
    ) values (
      p_tenant_id, mapping_row.id, instruction->>'localId', instruction->>'scope',
      instruction->>'category', instruction->>'text', instruction->'sourceLocation'
    );
  end loop;

  for warning in select value from jsonb_array_elements(coalesce(p_manifest->'warnings', '[]'::jsonb)) loop
    insert into public.questionnaire_import_warnings (
      tenant_id, import_run_id, mapping_version_id, code, severity, message,
      source_location, affected_question_local_ids, affected_destination_local_ids,
      recommended_action, export_blocking, metadata
    ) values (
      p_tenant_id, import_row.id, mapping_row.id, warning->>'code',
      (warning->>'severity')::public.questionnaire_warning_severity,
      warning->>'message', warning->'sourceLocation',
      array(select jsonb_array_elements_text(coalesce(warning->'affectedQuestionLocalIds', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(warning->'affectedDestinationLocalIds', '[]'::jsonb))),
      warning->>'recommendedAction', coalesce((warning->>'exportBlocking')::boolean, false),
      coalesce(warning->'metadata', '{}'::jsonb)
    );
  end loop;

  update public.jobs
  set status = 'succeeded', completed_at = now(), lease_owner = null, lease_expires_at = null
  where tenant_id = p_tenant_id and id = p_job_id;

  insert into public.audit_events (
    tenant_id, actor_type, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'service', 'questionnaire.import_completed', 'questionnaire_artifact', artifact_row.id,
    gen_random_uuid(), jsonb_build_object(
      'import_run_id', import_row.id,
      'mapping_version_id', mapping_row.id,
      'question_count', jsonb_array_length(coalesce(p_manifest->'questions', '[]'::jsonb)),
      'compatibility_status', import_row.compatibility_status
    )
  );

  return query select import_row.id, mapping_row.id;
end;
$$;

create or replace function public.create_questionnaire_mapping_revision(
  p_tenant_id uuid,
  p_parent_mapping_version_id uuid,
  p_mapping jsonb,
  p_target_scope jsonb,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  parent_row public.questionnaire_mapping_versions;
  revision_row public.questionnaire_mapping_versions;
  next_version integer;
  question jsonb;
  destination jsonb;
  atomic_request jsonb;
  condition jsonb;
  instruction jsonb;
begin
  if not public.has_any_role(
    p_tenant_id,
    array['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver']::public.membership_role[]
  ) then
    raise exception using errcode = '42501', message = 'Questionnaire mapping review permission required';
  end if;

  select * into parent_row
  from public.questionnaire_mapping_versions
  where tenant_id = p_tenant_id and id = p_parent_mapping_version_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Parent mapping version not found'; end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.questionnaire_mapping_versions
  where tenant_id = p_tenant_id and questionnaire_artifact_id = parent_row.questionnaire_artifact_id;

  insert into public.questionnaire_mapping_versions (
    tenant_id, questionnaire_artifact_id, import_run_id, parent_mapping_version_id,
    version_number, status, compatibility_status, source_sha256,
    structural_fingerprint, processor_version, target_scope, mapping_notes, created_by
  ) values (
    p_tenant_id, parent_row.questionnaire_artifact_id, parent_row.import_run_id, parent_row.id,
    next_version, 'draft', parent_row.compatibility_status, parent_row.source_sha256,
    parent_row.structural_fingerprint, parent_row.processor_version,
    coalesce(p_target_scope, parent_row.target_scope), nullif(trim(p_notes), ''), auth.uid()
  ) returning * into revision_row;

  for question in select value from jsonb_array_elements(coalesce(p_mapping->'questions', '[]'::jsonb)) loop
    insert into public.questionnaire_questions (
      tenant_id, mapping_version_id, local_id, section_local_id, parent_local_id,
      external_identifier, original_text, normalized_text, question_type, polarity,
      display_order, source_location, answer_format, inclusion_status,
      mapping_confidence, parser_notes
    ) values (
      p_tenant_id, revision_row.id, question->>'localId', nullif(question->'sectionPath'->>-1, ''),
      nullif(question->>'parentLocalId', ''), nullif(question->>'externalIdentifier', ''),
      question->>'originalText', question->>'normalizedText',
      (question->>'type')::public.questionnaire_question_type,
      (question->>'polarity')::public.questionnaire_polarity,
      (question->>'displayOrder')::integer, question->'sourceLocation', question->'answerFormat',
      question->>'inclusionStatus', question->'confidence',
      array(select jsonb_array_elements_text(coalesce(question->'parserNotes', '[]'::jsonb)))
    );
    for atomic_request in select value from jsonb_array_elements(coalesce(question->'atomicRequests', '[]'::jsonb)) loop
      insert into public.questionnaire_atomic_requests (
        tenant_id, mapping_version_id, question_local_id, local_id, sequence,
        original_clause, normalized_claim, qualifiers, materiality
      ) values (
        p_tenant_id, revision_row.id, question->>'localId', atomic_request->>'localId',
        (atomic_request->>'sequence')::integer, atomic_request->>'originalClause',
        atomic_request->>'normalizedClaim',
        array(select jsonb_array_elements_text(coalesce(atomic_request->'qualifiers', '[]'::jsonb))),
        atomic_request->>'materiality'
      );
    end loop;
  end loop;

  for destination in select value from jsonb_array_elements(coalesce(p_mapping->'destinations', '[]'::jsonb)) loop
    insert into public.questionnaire_answer_destinations (
      tenant_id, mapping_version_id, local_id, question_local_id, destination_type,
      source_location, expected_value_type, allowed_values, stored_values,
      formula_present, protected, style_hash, validation_hash, write_strategy
    ) values (
      p_tenant_id, revision_row.id, destination->>'localId', nullif(destination->>'questionLocalId', ''),
      (destination->>'type')::public.questionnaire_destination_type,
      destination->'location', destination->>'expectedValueType',
      array(select jsonb_array_elements_text(coalesce(destination->'allowedValues', '[]'::jsonb))),
      coalesce(destination->'storedValues', '{}'::jsonb),
      coalesce((destination->>'formulaPresent')::boolean, false),
      coalesce((destination->>'protected')::boolean, false),
      nullif(destination->>'styleHash', ''), nullif(destination->>'validationHash', ''),
      destination->>'writeStrategy'
    );
  end loop;

  for condition in select value from jsonb_array_elements(coalesce(p_mapping->'conditions', '[]'::jsonb)) loop
    insert into public.questionnaire_conditions (
      tenant_id, mapping_version_id, local_id, child_question_local_id,
      original_instruction, expression, parser_confidence, human_confirmed
    ) values (
      p_tenant_id, revision_row.id, condition->>'localId', condition->>'childQuestionLocalId',
      condition->>'originalInstruction', condition->'expression',
      (condition->>'parserConfidence')::numeric,
      coalesce((condition->>'humanConfirmed')::boolean, false)
    );
  end loop;

  for instruction in select value from jsonb_array_elements(coalesce(p_mapping->'instructions', '[]'::jsonb)) loop
    insert into public.questionnaire_instructions (
      tenant_id, mapping_version_id, local_id, instruction_scope, category, instruction_text, source_location
    ) values (
      p_tenant_id, revision_row.id, instruction->>'localId', instruction->>'scope',
      instruction->>'category', instruction->>'text', instruction->'sourceLocation'
    );
  end loop;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'questionnaire.mapping_revised', 'questionnaire_mapping_version', revision_row.id,
    gen_random_uuid(), jsonb_build_object('parent_mapping_version_id', parent_row.id, 'version_number', next_version)
  );
  return revision_row.id;
end;
$$;

create or replace function public.resolve_questionnaire_warning(
  p_tenant_id uuid,
  p_warning_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.has_any_role(
    p_tenant_id,
    array['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver']::public.membership_role[]
  ) then
    raise exception using errcode = '42501', message = 'Questionnaire warning review permission required';
  end if;
  update public.questionnaire_import_warnings
  set resolved_by = auth.uid(), resolved_at = now(), resolution = trim(p_resolution)
  where tenant_id = p_tenant_id and id = p_warning_id and resolved_at is null;
  if not found then raise exception using errcode = 'P0002', message = 'Unresolved warning not found'; end if;
end;
$$;

create or replace function public.freeze_questionnaire_snapshot(
  p_tenant_id uuid,
  p_mapping_version_id uuid,
  p_snapshot_hash text,
  p_target_scope jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  mapping_row public.questionnaire_mapping_versions;
  snapshot_row public.questionnaire_snapshots;
  question_count_value integer;
  atomic_count_value integer;
  unresolved_blockers integer;
  unresolved_questions integer;
  unsafe_destinations integer;
begin
  if not public.has_any_role(p_tenant_id, array['final_approver']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Final approver role required';
  end if;
  if p_snapshot_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Valid snapshot hash required';
  end if;

  select * into mapping_row
  from public.questionnaire_mapping_versions
  where tenant_id = p_tenant_id and id = p_mapping_version_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Questionnaire mapping not found'; end if;
  if mapping_row.status <> 'draft' then
    raise exception using errcode = '22023', message = 'Only draft mappings may be frozen';
  end if;
  if mapping_row.compatibility_status in ('unsupported', 'import_only') then
    raise exception using errcode = '22023', message = 'This mapping is not eligible for an exportable snapshot';
  end if;
  if coalesce(p_target_scope->>'mode', 'unknown') = 'unknown' then
    raise exception using errcode = '22023', message = 'Explicit questionnaire scope is required';
  end if;

  select count(*) into unresolved_blockers
  from public.questionnaire_import_warnings
  where tenant_id = p_tenant_id and mapping_version_id = mapping_row.id
    and export_blocking and resolved_at is null;
  select count(*) into unresolved_questions
  from public.questionnaire_questions
  where tenant_id = p_tenant_id and mapping_version_id = mapping_row.id
    and inclusion_status = 'needs_review';
  select count(*) into unsafe_destinations
  from public.questionnaire_answer_destinations
  where tenant_id = p_tenant_id and mapping_version_id = mapping_row.id
    and (formula_present or protected or destination_type = 'manual');

  if unresolved_blockers > 0 then
    raise exception using errcode = '22023', message = 'Export-blocking warnings remain unresolved';
  end if;
  if unresolved_questions > 0 then
    raise exception using errcode = '22023', message = 'Questions requiring mapping review remain';
  end if;
  if unsafe_destinations > 0 and mapping_row.compatibility_status <> 'manual_mapping_required' then
    raise exception using errcode = '22023', message = 'Unsafe answer destinations remain';
  end if;

  select count(*) into question_count_value
  from public.questionnaire_questions
  where tenant_id = p_tenant_id and mapping_version_id = mapping_row.id and inclusion_status = 'included';
  select count(*) into atomic_count_value
  from public.questionnaire_atomic_requests
  where tenant_id = p_tenant_id and mapping_version_id = mapping_row.id;

  update public.questionnaire_mapping_versions
  set status = 'frozen', frozen_by = auth.uid(), frozen_at = now(), target_scope = p_target_scope
  where tenant_id = p_tenant_id and id = mapping_row.id;

  insert into public.questionnaire_snapshots (
    tenant_id, questionnaire_artifact_id, mapping_version_id, snapshot_hash,
    target_scope, question_count, atomic_request_count, frozen_by
  ) values (
    p_tenant_id, mapping_row.questionnaire_artifact_id, mapping_row.id, p_snapshot_hash,
    p_target_scope, question_count_value, atomic_count_value, auth.uid()
  ) returning * into snapshot_row;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'questionnaire.snapshot_frozen', 'questionnaire_snapshot', snapshot_row.id,
    gen_random_uuid(), jsonb_build_object('mapping_version_id', mapping_row.id, 'snapshot_hash', p_snapshot_hash)
  );
  return snapshot_row.id;
end;
$$;

create or replace function public.create_questionnaire_export_plan(
  p_tenant_id uuid,
  p_questionnaire_snapshot_id uuid,
  p_answer_snapshot_hash text,
  p_operations jsonb,
  p_blocking_errors text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  snapshot_row public.questionnaire_snapshots;
  artifact_row public.questionnaire_artifacts;
  plan_row public.questionnaire_export_plans;
  operation jsonb;
  operation_order integer := 0;
begin
  if not public.has_any_role(p_tenant_id, array['final_approver']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Final approver role required';
  end if;
  if p_answer_snapshot_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Valid answer snapshot hash required';
  end if;

  select * into snapshot_row
  from public.questionnaire_snapshots
  where tenant_id = p_tenant_id and id = p_questionnaire_snapshot_id and status in ('frozen', 'approved')
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Frozen questionnaire snapshot not found'; end if;
  select * into artifact_row
  from public.questionnaire_artifacts
  where tenant_id = p_tenant_id and id = snapshot_row.questionnaire_artifact_id;

  insert into public.questionnaire_export_plans (
    tenant_id, questionnaire_snapshot_id, source_sha256, snapshot_hash,
    answer_snapshot_hash, status, blocking_errors, expected_change_count, created_by
  ) values (
    p_tenant_id, snapshot_row.id, artifact_row.source_sha256, snapshot_row.snapshot_hash,
    p_answer_snapshot_hash,
    case when coalesce(array_length(p_blocking_errors, 1), 0) > 0 then 'blocked'::public.questionnaire_export_status else 'draft'::public.questionnaire_export_status end,
    coalesce(p_blocking_errors, '{}'), jsonb_array_length(coalesce(p_operations, '[]'::jsonb)), auth.uid()
  ) returning * into plan_row;

  for operation in select value from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb)) loop
    operation_order := operation_order + 1;
    insert into public.questionnaire_export_operations (
      tenant_id, export_plan_id, local_id, question_local_id, destination_local_id,
      operation_type, outward_value, expected_original_value, expected_formula_state,
      expected_style_hash, expected_validation_hash, condition_activation, display_order
    ) values (
      p_tenant_id, plan_row.id, operation->>'localId', operation->>'questionLocalId',
      operation->>'destinationLocalId', operation->>'operationType', operation->'outwardValue',
      operation->'expectedOriginalValue', coalesce((operation->>'expectedFormulaState')::boolean, false),
      nullif(operation->>'expectedStyleHash', ''), nullif(operation->>'expectedValidationHash', ''),
      operation->>'conditionActivation', operation_order
    );
  end loop;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'questionnaire.export_plan_created', 'questionnaire_export_plan', plan_row.id,
    gen_random_uuid(), jsonb_build_object('snapshot_id', snapshot_row.id, 'operation_count', operation_order, 'blocked', plan_row.status = 'blocked')
  );
  return plan_row.id;
end;
$$;

create or replace function public.validate_questionnaire_export_plan(
  p_tenant_id uuid,
  p_export_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  plan_row public.questionnaire_export_plans;
  invalid_operations integer;
begin
  if not public.has_any_role(p_tenant_id, array['final_approver']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Final approver role required';
  end if;
  select * into plan_row
  from public.questionnaire_export_plans
  where tenant_id = p_tenant_id and id = p_export_plan_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Export plan not found'; end if;
  if plan_row.status = 'blocked' or coalesce(array_length(plan_row.blocking_errors, 1), 0) > 0 then
    raise exception using errcode = '22023', message = 'Blocked export plan cannot be validated';
  end if;
  select count(*) into invalid_operations
  from public.questionnaire_export_operations
  where tenant_id = p_tenant_id and export_plan_id = plan_row.id
    and condition_activation = 'unknown';
  if invalid_operations > 0 then
    raise exception using errcode = '22023', message = 'Export plan contains unresolved conditions';
  end if;
  update public.questionnaire_export_plans
  set status = 'validated', validated_by = auth.uid(), validated_at = now()
  where tenant_id = p_tenant_id and id = plan_row.id;
end;
$$;

create or replace function public.start_questionnaire_export(
  p_tenant_id uuid,
  p_export_plan_id uuid,
  p_output_object_id uuid,
  p_correlation_id uuid
)
returns table (job_id uuid, outbox_id uuid, export_run_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  plan_row public.questionnaire_export_plans;
  snapshot_row public.questionnaire_snapshots;
  artifact_row public.questionnaire_artifacts;
  source_object public.stored_objects;
  output_object public.stored_objects;
  job_row public.jobs;
  outbox_row public.questionnaire_queue_outbox;
  run_row public.questionnaire_export_runs;
  storage_path text;
  idempotency text;
  extension text;
begin
  if not public.has_any_role(p_tenant_id, array['final_approver']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Final approver role required';
  end if;
  select * into plan_row
  from public.questionnaire_export_plans
  where tenant_id = p_tenant_id and id = p_export_plan_id and status = 'validated'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Validated export plan not found'; end if;
  select * into snapshot_row from public.questionnaire_snapshots
  where tenant_id = p_tenant_id and id = plan_row.questionnaire_snapshot_id and status in ('frozen', 'approved');
  select * into artifact_row from public.questionnaire_artifacts
  where tenant_id = p_tenant_id and id = snapshot_row.questionnaire_artifact_id;
  select * into source_object from public.stored_objects
  where tenant_id = p_tenant_id and id = artifact_row.stored_object_id and sha256 = plan_row.source_sha256 and status = 'accepted';
  if not found then raise exception using errcode = '22023', message = 'Export source no longer matches the frozen snapshot'; end if;

  extension := artifact_row.format::text;
  storage_path := format('tenant/%s/objects/%s/original', p_tenant_id, p_output_object_id);
  insert into public.stored_objects (
    tenant_id, id, storage_bucket, storage_path, file_name,
    declared_mime_type, size_bytes, status, created_by
  ) values (
    p_tenant_id, p_output_object_id, source_object.storage_bucket, storage_path,
    format('completed-%s.%s', artifact_row.id, extension),
    case artifact_row.format
      when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      when 'csv' then 'text/csv'
      when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      else 'application/octet-stream'
    end,
    1, 'upload_requested', auth.uid()
  ) returning * into output_object;

  idempotency := format('export_questionnaire:%s:%s:%s', plan_row.id, plan_row.answer_snapshot_hash, 'phase4-v1');
  insert into public.jobs (
    tenant_id, type, status, object_id, idempotency_key, correlation_id, created_by, max_attempts
  ) values (
    p_tenant_id, 'export_questionnaire', 'pending', source_object.id,
    idempotency, p_correlation_id, auth.uid(), 2
  ) returning * into job_row;

  insert into public.questionnaire_export_runs (
    tenant_id, export_plan_id, job_id, output_object_id, status
  ) values (
    p_tenant_id, plan_row.id, job_row.id, output_object.id, 'executing'
  ) returning * into run_row;

  insert into public.questionnaire_queue_outbox (
    tenant_id, job_id, export_plan_id, topic, payload
  ) values (
    p_tenant_id, job_row.id, plan_row.id, 'export_questionnaire',
    jsonb_build_object(
      'version', 1,
      'type', 'export_questionnaire',
      'tenantId', p_tenant_id,
      'exportPlanId', plan_row.id,
      'exportRunId', run_row.id,
      'sourceObjectId', source_object.id,
      'outputObjectId', output_object.id,
      'jobId', job_row.id,
      'correlationId', p_correlation_id
    )
  ) returning * into outbox_row;

  update public.questionnaire_export_plans set status = 'executing'
  where tenant_id = p_tenant_id and id = plan_row.id;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'questionnaire.export_started', 'questionnaire_export_run', run_row.id,
    p_correlation_id, jsonb_build_object('export_plan_id', plan_row.id, 'output_object_id', output_object.id)
  );
  return query select job_row.id, outbox_row.id, run_row.id;
end;
$$;

create or replace function public.complete_questionnaire_export(
  p_tenant_id uuid,
  p_export_run_id uuid,
  p_output_sha256 text,
  p_output_size_bytes bigint,
  p_changed_locations text[],
  p_warnings text[],
  p_structural_diffs jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.questionnaire_export_runs;
  diff jsonb;
  blocking_count integer := 0;
begin
  if p_output_sha256 !~ '^[a-f0-9]{64}$' or p_output_size_bytes <= 0 then
    raise exception using errcode = '22023', message = 'Valid export artifact identity required';
  end if;
  select * into run_row
  from public.questionnaire_export_runs
  where tenant_id = p_tenant_id and id = p_export_run_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Export run not found'; end if;

  delete from public.questionnaire_export_diffs
  where tenant_id = p_tenant_id and export_run_id = run_row.id;
  for diff in select value from jsonb_array_elements(coalesce(p_structural_diffs, '[]'::jsonb)) loop
    insert into public.questionnaire_export_diffs (
      tenant_id, export_run_id, package_path, before_hash, after_hash, classification, reason
    ) values (
      p_tenant_id, run_row.id, diff->>'path', nullif(diff->>'beforeHash', ''),
      nullif(diff->>'afterHash', ''),
      (diff->>'classification')::public.questionnaire_diff_classification,
      diff->>'reason'
    );
    if diff->>'classification' = 'blocking' then blocking_count := blocking_count + 1; end if;
  end loop;

  if blocking_count > 0 then
    update public.questionnaire_export_runs
    set status = 'blocked', output_sha256 = p_output_sha256,
      changed_locations = coalesce(p_changed_locations, '{}'), warnings = coalesce(p_warnings, '{}'),
      completed_at = now(), last_error_code = 'structural_diff_blocked'
    where tenant_id = p_tenant_id and id = run_row.id;
    update public.questionnaire_export_plans set status = 'blocked'
    where tenant_id = p_tenant_id and id = run_row.export_plan_id;
    raise exception using errcode = '22023', message = 'Unexpected structural differences blocked the export';
  end if;

  update public.stored_objects
  set size_bytes = p_output_size_bytes, sha256 = p_output_sha256,
      detected_mime_type = declared_mime_type, status = 'accepted', validated_at = now(),
      malware_scan_status = 'clean'
  where tenant_id = p_tenant_id and id = run_row.output_object_id and status = 'upload_requested';

  update public.questionnaire_export_runs
  set status = 'succeeded', output_sha256 = p_output_sha256,
    changed_locations = coalesce(p_changed_locations, '{}'), warnings = coalesce(p_warnings, '{}'),
    completed_at = now()
  where tenant_id = p_tenant_id and id = run_row.id;
  update public.questionnaire_export_plans set status = 'succeeded'
  where tenant_id = p_tenant_id and id = run_row.export_plan_id;
  update public.jobs set status = 'succeeded', completed_at = now(), lease_owner = null, lease_expires_at = null
  where tenant_id = p_tenant_id and id = run_row.job_id;

  insert into public.audit_events (
    tenant_id, actor_type, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'service', 'questionnaire.export_validated', 'questionnaire_export_run', run_row.id,
    gen_random_uuid(), jsonb_build_object('output_sha256', p_output_sha256, 'changed_location_count', coalesce(array_length(p_changed_locations, 1), 0))
  );
end;
$$;
