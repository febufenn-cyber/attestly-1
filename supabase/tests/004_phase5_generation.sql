begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('51000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contributor-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('51000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reviewer-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contributor-beta@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, slug, created_by) values
  ('eaaaaaaa-0000-0000-0000-000000000001', 'Generation Alpha', 'generation-alpha', '51000000-0000-0000-0000-000000000001'),
  ('ebbbbbbb-0000-0000-0000-000000000001', 'Generation Beta', 'generation-beta', '52000000-0000-0000-0000-000000000001');
insert into public.organization_memberships (tenant_id, user_id, role) values
  ('eaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'contributor'),
  ('eaaaaaaa-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'security_reviewer'),
  ('ebbbbbbb-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'contributor');

insert into public.stored_objects (
  tenant_id, id, storage_bucket, storage_path, file_name, declared_mime_type,
  detected_mime_type, size_bytes, sha256, status, malware_scan_status, created_by, validated_at
) values
  ('eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/eaaaaaaa-0000-0000-0000-000000000001/objects/eaaaaaaa-1000-0000-0000-000000000001/original', 'questionnaire.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1000, repeat('a',64), 'accepted', 'clean', '51000000-0000-0000-0000-000000000001', now()),
  ('eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-1000-0000-0000-000000000002', 'attestly-evidence', 'tenant/eaaaaaaa-0000-0000-0000-000000000001/objects/eaaaaaaa-1000-0000-0000-000000000002/original', 'access-review.txt', 'text/plain', 'text/plain', 500, repeat('c',64), 'accepted', 'clean', '51000000-0000-0000-0000-000000000002', now()),
  ('ebbbbbbb-0000-0000-0000-000000000001', 'ebbbbbbb-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/ebbbbbbb-0000-0000-0000-000000000001/objects/ebbbbbbb-1000-0000-0000-000000000001/original', 'access-review.txt', 'text/plain', 'text/plain', 500, repeat('d',64), 'accepted', 'clean', '52000000-0000-0000-0000-000000000001', now());

insert into public.questionnaire_artifacts (
  tenant_id, id, stored_object_id, source_sha256, format, original_filename, created_by
) values (
  'eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-2000-0000-0000-000000000001',
  'eaaaaaaa-1000-0000-0000-000000000001', repeat('a',64), 'xlsx', 'questionnaire.xlsx',
  '51000000-0000-0000-0000-000000000001'
);
insert into public.questionnaire_import_runs (
  tenant_id, id, questionnaire_artifact_id, status, processor_name, processor_version,
  ruleset_version, source_sha256, structural_fingerprint, compatibility_status,
  compatibility_dimensions, statistics, created_by, completed_at
) values (
  'eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-2100-0000-0000-000000000001',
  'eaaaaaaa-2000-0000-0000-000000000001', 'succeeded', 'fixture', '1', '1', repeat('a',64),
  repeat('b',64), 'compatible', '{}'::jsonb, '{}'::jsonb,
  '51000000-0000-0000-0000-000000000001', now()
);
insert into public.questionnaire_mapping_versions (
  tenant_id, id, questionnaire_artifact_id, import_run_id, version_number, status,
  compatibility_status, source_sha256, structural_fingerprint, processor_version,
  target_scope, created_by, frozen_by, frozen_at
) values (
  'eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-2200-0000-0000-000000000001',
  'eaaaaaaa-2000-0000-0000-000000000001', 'eaaaaaaa-2100-0000-0000-000000000001',
  1, 'frozen', 'compatible', repeat('a',64), repeat('b',64), '1',
  '{"mode":"selected","products":["Core SaaS"],"environments":["production"],"regions":["global"]}'::jsonb,
  '51000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', now()
);
insert into public.questionnaire_questions (
  tenant_id, id, mapping_version_id, local_id, original_text, normalized_text,
  question_type, polarity, display_order, source_location, answer_format,
  inclusion_status, mapping_confidence
) values (
  'eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-2300-0000-0000-000000000001',
  'eaaaaaaa-2200-0000-0000-000000000001', 'question-1',
  'Do you review privileged access quarterly?', 'Do you review privileged access quarterly?',
  'boolean_with_explanation', 'positive', 1,
  '{"format":"xlsx","sheetName":"Security","cellRange":"B2","sectionPath":[],"neighbouringLabels":[]}'::jsonb,
  '{"valueType":"boolean","allowedValues":["Yes","No"],"storedValues":{},"requiresExplanation":true,"requiresAttachment":false,"multilineAllowed":true,"blankAllowed":false,"notApplicableAllowed":true}'::jsonb,
  'included', '{"questionBoundary":1,"questionType":1,"instructionSeparation":1,"answerDestination":1,"answerFormat":1,"conditionalRelationship":1,"compoundDecomposition":1,"sectionAssignment":1,"scopeInference":1,"exportSafety":1}'::jsonb
);
insert into public.questionnaire_atomic_requests (
  tenant_id, id, mapping_version_id, question_local_id, local_id, sequence,
  original_clause, normalized_claim, qualifiers, materiality
) values (
  'eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-2400-0000-0000-000000000001',
  'eaaaaaaa-2200-0000-0000-000000000001', 'question-1', 'claim-1', 1,
  'review privileged access quarterly', 'Privileged access is reviewed quarterly.', array['quarterly'], 'material'
);
insert into public.questionnaire_snapshots (
  tenant_id, id, questionnaire_artifact_id, mapping_version_id, snapshot_hash, status,
  target_scope, question_count, atomic_request_count, frozen_by
) values (
  'eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-2500-0000-0000-000000000001',
  'eaaaaaaa-2000-0000-0000-000000000001', 'eaaaaaaa-2200-0000-0000-000000000001',
  repeat('e',64), 'frozen',
  '{"mode":"selected","products":["Core SaaS"],"environments":["production"],"regions":["global"]}'::jsonb,
  1, 1, '51000000-0000-0000-0000-000000000002'
);

insert into public.evidence_scopes (tenant_id, id, mode, products, environments, regions, created_by) values
  ('eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-3000-0000-0000-000000000001', 'selected', array['Core SaaS'], array['production'], array['global'], '51000000-0000-0000-0000-000000000002'),
  ('ebbbbbbb-0000-0000-0000-000000000001', 'ebbbbbbb-3000-0000-0000-000000000001', 'selected', array['Core SaaS'], array['production'], array['global'], '52000000-0000-0000-0000-000000000001');
insert into public.evidence_documents (
  tenant_id, id, title, source_type, evidence_class, owner_user_id, confidentiality,
  disclosure_policy, scope_id, lifecycle_status, created_by
) values
  ('eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-3100-0000-0000-000000000001', 'Access Review Record', 'report', 'operational_proof', '51000000-0000-0000-0000-000000000002', 'confidential', 'external_summary_only', 'eaaaaaaa-3000-0000-0000-000000000001', 'approved', '51000000-0000-0000-0000-000000000002'),
  ('ebbbbbbb-0000-0000-0000-000000000001', 'ebbbbbbb-3100-0000-0000-000000000001', 'Access Review Record', 'report', 'operational_proof', '52000000-0000-0000-0000-000000000001', 'confidential', 'external_summary_only', 'ebbbbbbb-3000-0000-0000-000000000001', 'approved', '52000000-0000-0000-0000-000000000001');
insert into public.evidence_versions (
  tenant_id, id, evidence_document_id, stored_object_id, scope_id, version_label,
  source_sha256, effective_from, review_due_at, lifecycle_status, extraction_status,
  index_status, malware_scan_status, extraction_quality, created_by, approved_by, approved_at
) values
  ('eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-3200-0000-0000-000000000001', 'eaaaaaaa-3100-0000-0000-000000000001', 'eaaaaaaa-1000-0000-0000-000000000002', 'eaaaaaaa-3000-0000-0000-000000000001', '2026-Q2', repeat('c',64), current_date - 30, current_date + 300, 'approved', 'succeeded', 'ready', 'clean', 0.98, '51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', now()),
  ('ebbbbbbb-0000-0000-0000-000000000001', 'ebbbbbbb-3200-0000-0000-000000000001', 'ebbbbbbb-3100-0000-0000-000000000001', 'ebbbbbbb-1000-0000-0000-000000000001', 'ebbbbbbb-3000-0000-0000-000000000001', '2026-Q2', repeat('d',64), current_date - 30, current_date + 300, 'approved', 'succeeded', 'ready', 'clean', 0.98, '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', now());
insert into public.extraction_runs (
  tenant_id, id, evidence_version_id, status, source_sha256, extractor_name,
  extractor_version, normalization_ruleset_version, completed_at
) values
  ('eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-3300-0000-0000-000000000001', 'eaaaaaaa-3200-0000-0000-000000000001', 'succeeded', repeat('c',64), 'fixture', '1', '1', now()),
  ('ebbbbbbb-0000-0000-000000000001', 'ebbbbbbb-3300-0000-0000-000000000001', 'ebbbbbbb-3200-0000-0000-000000000001', 'succeeded', repeat('d',64), 'fixture', '1', '1', now());
insert into public.evidence_spans (
  tenant_id, id, evidence_version_id, extraction_run_id, local_id, source_node_local_ids,
  text_content, normalized_text, page_number, heading_path, extraction_method,
  extraction_confidence, source_location, content_hash
) values
  ('eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-3400-0000-0000-000000000001', 'eaaaaaaa-3200-0000-0000-000000000001', 'eaaaaaaa-3300-0000-0000-000000000001', 'span-1', array['node-1'], 'Privileged user access is reviewed quarterly by the security team.', 'privileged user access is reviewed quarterly by the security team.', 1, array['Access Review'], 'native_text', 0.98, '{"pageNumber":1}'::jsonb, repeat('f',64)),
  ('ebbbbbbb-0000-0000-000000000001', 'ebbbbbbb-3400-0000-0000-000000000001', 'ebbbbbbb-3200-0000-0000-000000000001', 'ebbbbbbb-3300-0000-0000-000000000001', 'span-1', array['node-1'], 'Privileged user access is reviewed quarterly by the security team.', 'privileged user access is reviewed quarterly by the security team.', 1, array['Access Review'], 'native_text', 0.98, '{"pageNumber":1}'::jsonb, repeat('9',64));

create temporary table phase5_ids (
  run_id uuid, job_id uuid, outbox_id uuid, revision_id uuid,
  blocked_run_id uuid, blocked_revision_id uuid
);
insert into phase5_ids default values;
grant select, insert, update on phase5_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","email":"contributor-alpha@example.test","role":"authenticated"}', true);
with requested as (
  select * from public.request_answer_generation(
    'eaaaaaaa-0000-0000-0000-000000000001', 'eaaaaaaa-2500-0000-0000-000000000001',
    'eaaaaaaa-2300-0000-0000-000000000001', 'internal_answer_draft',
    'fixture', 'fixture-model', '1', 'phase5-v1', 1,
    'eaaaaaaa-4000-4000-8000-000000000001'
  )
)
update phase5_ids set run_id = requested.generation_run_id, job_id = requested.job_id,
  outbox_id = requested.outbox_id from requested;
select is((select count(*)::integer from public.generation_runs), 1, 'Contributor creates one tenant-bound generation run');
select is((select type::text from public.jobs where id = (select job_id from phase5_ids)), 'generate_answer', 'Generation request creates a typed job');
select throws_ok($$select count(*) from public.generation_queue_outbox$$, '42501', null, 'Authenticated users cannot read generation outbox records');
select is((select count(*)::integer from public.generation_runs), 1, 'Requester can read the own generation run');
select throws_ok(
  $$select * from public.request_answer_generation('ebbbbbbb-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), 'internal_answer_draft', 'fixture', 'fixture-model', '1', 'phase5-v1', 1, gen_random_uuid())$$,
  '42501', 'Answer generation permission required', 'Contributor cannot request work in another tenant'
);
reset role;

select lives_ok(
  $$select public.persist_generation_input(
    'eaaaaaaa-0000-0000-0000-000000000001', (select run_id from phase5_ids), repeat('1',64),
    jsonb_build_object('tenantId','eaaaaaaa-0000-0000-0000-000000000001','generationRunId',(select run_id from phase5_ids),'questionnaireSnapshotId','eaaaaaaa-2500-0000-0000-000000000001','questionId','eaaaaaaa-2300-0000-0000-000000000001','snapshotHash',repeat('e',64)),
    jsonb_build_array(jsonb_build_object('spanId','eaaaaaaa-3400-0000-0000-000000000001','evidenceVersionId','eaaaaaaa-3200-0000-0000-000000000001','candidateOrder',1,'retrievalScore',0.95,'scopeMatch','exact'))
  )$$,
  'Service persists immutable input and candidate snapshots'
);
select is((select count(*)::integer from public.generation_candidates), 1, 'One exact candidate is frozen for the run');
select is((select status::text from public.generation_runs where id = (select run_id from phase5_ids)), 'generating', 'Input persistence advances the run');
select throws_ok(
  $$insert into public.generation_candidates (tenant_id, generation_run_id, evidence_span_id, evidence_version_id, candidate_order, candidate_snapshot) values ('eaaaaaaa-0000-0000-0000-000000000001',(select run_id from phase5_ids),'ebbbbbbb-3400-0000-0000-000000000001','ebbbbbbb-3200-0000-0000-000000000001',2,'{}'::jsonb)$$,
  '23514', 'Candidate span and evidence version do not match', 'Cross-tenant candidate is rejected before persistence'
);
select throws_ok($$update public.generation_runs set input_hash = repeat('2',64) where id = (select run_id from phase5_ids)$$, '42501', 'Generation input snapshot is immutable', 'Generation input cannot be rewritten');

update phase5_ids set revision_id = public.complete_generation_run(
  'eaaaaaaa-0000-0000-0000-000000000001', (select run_id from phase5_ids),
  jsonb_build_object(
    'tenantId','eaaaaaaa-0000-0000-0000-000000000001','generationRunId',(select run_id from phase5_ids),
    'questionnaireSnapshotId','eaaaaaaa-2500-0000-0000-000000000001','questionId','eaaaaaaa-2300-0000-0000-000000000001',
    'state','supported','outwardValue','Yes','outwardText','Yes. Privileged access is reviewed quarterly.',
    'claims',jsonb_build_array(jsonb_build_object(
      'claimLocalId','claim-1','originalClause','review privileged access quarterly','normalizedClaim','Privileged access is reviewed quarterly.',
      'qualifiers',jsonb_build_array('quarterly'),'materiality','material','disposition','supported','proposedStatement','Privileged access is reviewed quarterly.',
      'citations',jsonb_build_array(jsonb_build_object('spanId','eaaaaaaa-3400-0000-0000-000000000001','evidenceVersionId','eaaaaaaa-3200-0000-0000-000000000001','role','supports','quote','Privileged user access is reviewed quarterly by the security team.')),
      'reasons','[]'::jsonb,'missingInformation','[]'::jsonb)),
    'confidence',jsonb_build_object('overall',0.93),'riskTier','medium','requiredReviewers',jsonb_build_array('security_reviewer'),
    'limitations','[]'::jsonb,'contradictions','[]'::jsonb,'missingInformation','[]'::jsonb,
    'model',jsonb_build_object('provider','fixture','model','fixture-model','promptVersion','phase5-v1','schemaVersion',1),
    'deterministicValidation',jsonb_build_object('passed',true,'errors','[]'::jsonb,'warnings','[]'::jsonb)
  ), repeat('2',64)
);
select is((select count(*)::integer from public.answer_revisions), 1, 'Successful generation creates an immutable answer revision');
select is((select count(*)::integer from public.answer_claims), 1, 'Atomic claim result is persisted');
select is((select count(*)::integer from public.answer_citations), 1, 'Exact claim-level citation is persisted');
select is((select status::text from public.generation_runs where id = (select run_id from phase5_ids)), 'succeeded', 'Validated output completes the run');
select throws_ok($$update public.answer_revisions set outward_text = 'tampered'$$, '42501', 'Generation provenance records are append-only', 'Generated revisions cannot be edited in place');

set local role authenticated;
select set_config('request.jwt.claim.sub', '52000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"52000000-0000-0000-0000-000000000001","email":"contributor-beta@example.test","role":"authenticated"}', true);
select is((select count(*)::integer from public.generation_runs), 0, 'Another tenant cannot read generation runs');
select is((select count(*)::integer from public.answer_revisions), 0, 'Another tenant cannot read answer revisions');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000002","email":"reviewer-alpha@example.test","role":"authenticated"}', true);
select is((select count(*)::integer from public.answer_revisions), 1, 'Security reviewer can read generated revisions');
select is((select count(*)::integer from public.answer_citations), 1, 'Security reviewer can inspect exact citations');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","email":"contributor-alpha@example.test","role":"authenticated"}', true);
with requested as (
  select * from public.request_answer_generation(
    'eaaaaaaa-0000-0000-0000-000000000001','eaaaaaaa-2500-0000-0000-000000000001','eaaaaaaa-2300-0000-0000-000000000001',
    'internal_answer_draft','fixture','fixture-model','1','phase5-blocked',1,'eaaaaaaa-4000-4000-8000-000000000002'
  )
)
update phase5_ids set blocked_run_id = requested.generation_run_id from requested;
reset role;
select public.persist_generation_input(
  'eaaaaaaa-0000-0000-0000-000000000001',(select blocked_run_id from phase5_ids),repeat('3',64),
  jsonb_build_object('tenantId','eaaaaaaa-0000-0000-0000-000000000001','generationRunId',(select blocked_run_id from phase5_ids),'questionnaireSnapshotId','eaaaaaaa-2500-0000-0000-000000000001','questionId','eaaaaaaa-2300-0000-0000-000000000001','snapshotHash',repeat('e',64)),
  '[]'::jsonb
);
update phase5_ids set blocked_revision_id = public.complete_generation_run(
  'eaaaaaaa-0000-0000-0000-000000000001',(select blocked_run_id from phase5_ids),
  jsonb_build_object(
    'tenantId','eaaaaaaa-0000-0000-0000-000000000001','generationRunId',(select blocked_run_id from phase5_ids),
    'questionnaireSnapshotId','eaaaaaaa-2500-0000-0000-000000000001','questionId','eaaaaaaa-2300-0000-0000-000000000001',
    'state','blocked_from_automation','outwardValue',null,'outwardText','',
    'claims',jsonb_build_array(jsonb_build_object('claimLocalId','claim-1','originalClause','review privileged access quarterly','normalizedClaim','Privileged access is reviewed quarterly.','qualifiers',jsonb_build_array('quarterly'),'materiality','material','disposition','blocked','proposedStatement','','citations','[]'::jsonb,'reasons',jsonb_build_array('Validation failed'),'missingInformation','[]'::jsonb)),
    'confidence',jsonb_build_object('overall',0.1),'riskTier','high','requiredReviewers',jsonb_build_array('security_reviewer'),
    'limitations','[]'::jsonb,'contradictions','[]'::jsonb,'missingInformation','[]'::jsonb,
    'model',jsonb_build_object('provider','fixture','model','fixture-model','promptVersion','phase5-blocked','schemaVersion',1),
    'deterministicValidation',jsonb_build_object('passed',false,'errors',jsonb_build_array('fixture'),'warnings','[]'::jsonb)
  ), repeat('4',64)
);
select is((select state::text from public.answer_revisions where id = (select blocked_revision_id from phase5_ids)), 'blocked_from_automation', 'Invalid output is retained only as blocked');
select is((select outward_value from public.answer_revisions where id = (select blocked_revision_id from phase5_ids)), null, 'Blocked output stores no outward value');
select is((select status::text from public.generation_runs where id = (select blocked_run_id from phase5_ids)), 'blocked', 'Blocked validation creates a terminal blocked run');
select cmp_ok((select count(*) from public.audit_events where action = 'answer.generation_completed'), '>=', 2::bigint, 'Generation completion is audited without prompt content');

select * from finish();
rollback;
