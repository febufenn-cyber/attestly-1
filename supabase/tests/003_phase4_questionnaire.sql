begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('41000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approver-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('41000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contributor-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('42000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approver-beta@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, slug, created_by) values
  ('daaaaaaa-0000-0000-0000-000000000001', 'Questionnaire Alpha', 'questionnaire-alpha', '41000000-0000-0000-0000-000000000001'),
  ('dbbbbbbb-0000-0000-0000-000000000001', 'Questionnaire Beta', 'questionnaire-beta', '42000000-0000-0000-0000-000000000001');

insert into public.organization_memberships (tenant_id, user_id, role) values
  ('daaaaaaa-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'final_approver'),
  ('daaaaaaa-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', 'contributor'),
  ('dbbbbbbb-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'final_approver');

insert into public.stored_objects (
  tenant_id, id, storage_bucket, storage_path, file_name, declared_mime_type,
  detected_mime_type, size_bytes, sha256, status, malware_scan_status, created_by, validated_at
) values
  ('daaaaaaa-0000-0000-0000-000000000001', 'daaaaaaa-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/daaaaaaa-0000-0000-0000-000000000001/objects/daaaaaaa-1000-0000-0000-000000000001/original', 'security-questionnaire.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1000, repeat('a', 64), 'accepted', 'clean', '41000000-0000-0000-0000-000000000001', now()),
  ('dbbbbbbb-0000-0000-0000-000000000001', 'dbbbbbbb-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/dbbbbbbb-0000-0000-0000-000000000001/objects/dbbbbbbb-1000-0000-0000-000000000001/original', 'security-questionnaire.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1000, repeat('b', 64), 'accepted', 'clean', '42000000-0000-0000-0000-000000000001', now());

create temporary table phase4_ids (
  artifact_id uuid,
  job_id uuid,
  outbox_id uuid,
  import_run_id uuid,
  mapping_version_id uuid,
  snapshot_id uuid,
  export_plan_id uuid,
  export_job_id uuid,
  export_outbox_id uuid,
  export_run_id uuid,
  output_object_id uuid
);
grant select, insert, update on phase4_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","email":"contributor-alpha@example.test","role":"authenticated"}', true);

insert into phase4_ids (artifact_id)
select public.create_questionnaire_artifact(
  'daaaaaaa-0000-0000-0000-000000000001',
  'daaaaaaa-1000-0000-0000-000000000001',
  'xlsx'
);
select is((select count(*)::integer from public.questionnaire_artifacts), 1, 'Contributor may admit an accepted questionnaire artifact');

with queued as (
  select * from public.start_questionnaire_import(
    'daaaaaaa-0000-0000-0000-000000000001',
    (select artifact_id from phase4_ids),
    'daaaaaaa-2000-4000-8000-000000000001'
  )
)
update phase4_ids set job_id = queued.job_id, outbox_id = queued.outbox_id from queued;
select is((select count(*)::integer from public.jobs where type = 'inspect_questionnaire'), 1, 'Import request creates one typed questionnaire job');
select throws_ok(
  $$select count(*) from public.questionnaire_queue_outbox$$,
  '42501',
  null,
  'Authenticated users receive a hard denial on the privileged questionnaire outbox'
);

select throws_ok(
  $$select public.freeze_questionnaire_snapshot(
    'daaaaaaa-0000-0000-0000-000000000001',
    gen_random_uuid(), repeat('c',64),
    '{"mode":"selected","products":["Core SaaS"],"environments":["production"],"regions":["global"]}'::jsonb
  )$$,
  '42501',
  'Final approver role required',
  'Contributors cannot freeze questionnaire snapshots'
);

reset role;

with completed as (
  select * from public.complete_questionnaire_import(
    'daaaaaaa-0000-0000-0000-000000000001',
    (select artifact_id from phase4_ids),
    (select job_id from phase4_ids),
    jsonb_build_object(
      'manifestVersion', 1,
      'processorName', 'test-questionnaire-processor',
      'processorVersion', 'phase4-v1',
      'rulesetVersion', 'questionnaire-rules-v1',
      'sourceSha256', repeat('a',64),
      'format', 'xlsx',
      'compatibilityStatus', 'compatible',
      'compatibilityDimensions', jsonb_build_object(
        'import', 'compatible', 'questionDetection', 'compatible',
        'answerMapping', 'compatible', 'conditionalLogic', 'compatible', 'export', 'compatible'
      ),
      'structuralFingerprint', repeat('f',64),
      'inventory', jsonb_build_object(
        'format', 'xlsx', 'sourceSha256', repeat('a',64),
        'sheetNames', jsonb_build_array('Security'),
        'sheetVisibility', jsonb_build_object('Security','visible'),
        'usedRanges', jsonb_build_object('Security','A1:C2'),
        'hiddenRows', '{}'::jsonb, 'hiddenColumns', '{}'::jsonb,
        'mergedRanges', '{}'::jsonb, 'formulaCells', '{}'::jsonb,
        'validationCells', jsonb_build_object('Security',jsonb_build_array('C2')),
        'namedRanges', '[]'::jsonb, 'externalLinks', '[]'::jsonb,
        'embeddedObjects', '[]'::jsonb, 'macroPresent', false,
        'protectedWorkbook', false, 'protectedSheets', '[]'::jsonb,
        'unsupportedParts', '[]'::jsonb, 'packagePartHashes', '{}'::jsonb
      ),
      'questions', jsonb_build_array(jsonb_build_object(
        'localId','question-1', 'externalIdentifier','AC-1',
        'originalText','Is MFA required for all production administrators?',
        'normalizedText','Access Control: Is MFA required for all production administrators?',
        'type','boolean', 'polarity','positive', 'displayOrder',1,
        'sectionPath',jsonb_build_array('Security','Access Control'),
        'sourceLocation',jsonb_build_object('format','xlsx','sheetName','Security','cellRange','B2','sectionPath',jsonb_build_array('Security','Access Control'),'neighbouringLabels','[]'::jsonb),
        'answerFormat',jsonb_build_object('valueType','boolean','allowedValues',jsonb_build_array('Yes','No'),'storedValues','{}'::jsonb,'requiresExplanation',false,'requiresAttachment',false,'multilineAllowed',false,'blankAllowed',false,'notApplicableAllowed',false),
        'answerDestinationLocalIds',jsonb_build_array('destination-1'),
        'atomicRequests',jsonb_build_array(jsonb_build_object('localId','claim-1','sequence',1,'originalClause','MFA required for all production administrators','normalizedClaim','MFA required for all production administrators','qualifiers',jsonb_build_array('all','production'),'materiality','material')),
        'inclusionStatus','included',
        'confidence',jsonb_build_object('questionBoundary',1,'questionType',1,'instructionSeparation',1,'answerDestination',1,'answerFormat',1,'conditionalRelationship',1,'compoundDecomposition',1,'sectionAssignment',1,'scopeInference',1,'exportSafety',1),
        'parserNotes','[]'::jsonb
      )),
      'destinations', jsonb_build_array(jsonb_build_object(
        'localId','destination-1','type','xlsx_cell',
        'location',jsonb_build_object('format','xlsx','sheetName','Security','cellRange','C2','rowIndex',2,'columnIndex',3,'sectionPath',jsonb_build_array('Security','Access Control'),'neighbouringLabels','[]'::jsonb),
        'expectedValueType','boolean','allowedValues',jsonb_build_array('Yes','No'),
        'storedValues',jsonb_build_object('true','Yes','false','No'),
        'formulaPresent',false,'protected',false,'writeStrategy','replace_value'
      )),
      'conditions','[]'::jsonb,
      'instructions','[]'::jsonb,
      'warnings','[]'::jsonb,
      'statistics',jsonb_build_object('detectedQuestions',1,'detectedDestinations',1,'unresolvedMappings',0),
      'startedAt',now() - interval '1 second','completedAt',now()
    ),
    repeat('e',64)
  )
)
update phase4_ids set import_run_id = completed.import_run_id, mapping_version_id = completed.mapping_version_id from completed;

select is((select count(*)::integer from public.questionnaire_import_runs), 1, 'Successful inspection creates one immutable import run');
select is((select count(*)::integer from public.questionnaire_mapping_versions), 1, 'Import creates one reviewable mapping version');
select is((select count(*)::integer from public.questionnaire_questions), 1, 'Canonical question is persisted');
select is((select count(*)::integer from public.questionnaire_atomic_requests), 1, 'Atomic claim request is persisted');
select is((select count(*)::integer from public.questionnaire_answer_destinations), 1, 'Exact answer destination is persisted');
select is((select source_sha256 from public.questionnaire_mapping_versions limit 1), repeat('a',64), 'Mapping remains bound to immutable source bytes');

select throws_ok(
  $$update public.questionnaire_artifacts set source_sha256 = repeat('b',64)$$,
  '42501',
  'Questionnaire artifact identity is immutable',
  'Questionnaire source identity cannot be rewritten'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","email":"approver-alpha@example.test","role":"authenticated"}', true);

update phase4_ids set snapshot_id = public.freeze_questionnaire_snapshot(
  'daaaaaaa-0000-0000-0000-000000000001',
  (select mapping_version_id from phase4_ids),
  repeat('c',64),
  '{"mode":"selected","products":["Core SaaS"],"environments":["production"],"regions":["global"],"deploymentModels":[],"customDimensions":{}}'::jsonb
);
select is((select status::text from public.questionnaire_mapping_versions where id = (select mapping_version_id from phase4_ids)), 'frozen', 'Final approver freezes the mapping version');
select is((select status::text from public.questionnaire_snapshots where id = (select snapshot_id from phase4_ids)), 'frozen', 'Frozen snapshot becomes the downstream contract');
select throws_ok(
  $$update public.questionnaire_snapshots set snapshot_hash = repeat('d',64)$$,
  '42501',
  'Frozen questionnaire snapshot identity is immutable',
  'Snapshot identity cannot be changed after freezing'
);

update phase4_ids set export_plan_id = public.create_questionnaire_export_plan(
  'daaaaaaa-0000-0000-0000-000000000001',
  (select snapshot_id from phase4_ids),
  repeat('d',64),
  jsonb_build_array(jsonb_build_object(
    'localId','operation-1','questionLocalId','question-1','destinationLocalId','destination-1',
    'operationType','write_cell_value','outwardValue','Yes','expectedOriginalValue',null,
    'expectedFormulaState',false,'conditionActivation','active'
  )),
  '{}'
);
select is((select expected_change_count from public.questionnaire_export_plans where id = (select export_plan_id from phase4_ids)), 1, 'Export plan records one deterministic expected change');
select lives_ok(
  format($$select public.validate_questionnaire_export_plan('daaaaaaa-0000-0000-0000-000000000001', %L)$$, (select export_plan_id from phase4_ids)),
  'Final approver validates an unblocked deterministic export plan'
);

with started as (
  select * from public.start_questionnaire_export(
    'daaaaaaa-0000-0000-0000-000000000001',
    (select export_plan_id from phase4_ids),
    'daaaaaaa-3000-0000-0000-000000000001',
    'daaaaaaa-4000-4000-8000-000000000001'
  )
)
update phase4_ids set export_job_id = started.job_id, export_outbox_id = started.outbox_id,
  export_run_id = started.export_run_id, output_object_id = 'daaaaaaa-3000-0000-0000-000000000001'
from started;
select is((select count(*)::integer from public.jobs where type = 'export_questionnaire'), 1, 'Validated export creates one typed export job');
select is((select status::text from public.stored_objects where id = (select output_object_id from phase4_ids)), 'upload_requested', 'Export receives a new immutable output object identity');

reset role;
select public.complete_questionnaire_export(
  'daaaaaaa-0000-0000-0000-000000000001',
  (select export_run_id from phase4_ids),
  repeat('9',64), 1200,
  array['Security!C2'],
  '{}',
  jsonb_build_array(jsonb_build_object(
    'path','xl/worksheets/sheet1.xml','beforeHash',repeat('1',64),'afterHash',repeat('2',64),
    'classification','expected','reason','Mapped answer cell changed.'
  ))
);
select is((select status::text from public.questionnaire_export_runs where id = (select export_run_id from phase4_ids)), 'succeeded', 'Round-trip validation completes the export run');
select is((select status::text from public.stored_objects where id = (select output_object_id from phase4_ids)), 'accepted', 'Validated export output becomes an accepted immutable artifact');

set local role authenticated;
select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"42000000-0000-0000-0000-000000000001","email":"approver-beta@example.test","role":"authenticated"}', true);
select is((select count(*)::integer from public.questionnaire_artifacts), 0, 'Another tenant cannot see questionnaire artifacts');
select is((select count(*)::integer from public.questionnaire_questions), 0, 'Another tenant cannot see questionnaire content');
select is((select count(*)::integer from public.questionnaire_snapshots), 0, 'Another tenant cannot see frozen snapshots');
select is((select count(*)::integer from public.questionnaire_export_runs), 0, 'Another tenant cannot see export artifacts');

select * from finish();
rollback;
