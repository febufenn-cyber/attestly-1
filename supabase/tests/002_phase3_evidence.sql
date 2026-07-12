begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('31000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contributor-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('32000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-beta@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, slug, created_by) values
  ('caaaaaaa-0000-0000-0000-000000000001', 'Evidence Alpha', 'evidence-alpha', '31000000-0000-0000-0000-000000000001'),
  ('cbbbbbbb-0000-0000-0000-000000000001', 'Evidence Beta', 'evidence-beta', '32000000-0000-0000-0000-000000000001');

insert into public.organization_memberships (tenant_id, user_id, role) values
  ('caaaaaaa-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'knowledge_owner'),
  ('caaaaaaa-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 'contributor'),
  ('cbbbbbbb-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'knowledge_owner');

insert into public.stored_objects (
  tenant_id, id, storage_bucket, storage_path, file_name, declared_mime_type,
  detected_mime_type, size_bytes, sha256, status, malware_scan_status, created_by, validated_at
) values
  ('caaaaaaa-0000-0000-0000-000000000001', 'caaaaaaa-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/caaaaaaa-0000-0000-0000-000000000001/objects/caaaaaaa-1000-0000-0000-000000000001/original', 'access-policy.txt', 'text/plain', 'text/plain', 100, repeat('a', 64), 'accepted', 'clean', '31000000-0000-0000-0000-000000000001', now()),
  ('cbbbbbbb-0000-0000-0000-000000000001', 'cbbbbbbb-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/cbbbbbbb-0000-0000-0000-000000000001/objects/cbbbbbbb-1000-0000-0000-000000000001/original', 'access-policy.txt', 'text/plain', 'text/plain', 100, repeat('b', 64), 'accepted', 'clean', '32000000-0000-0000-0000-000000000001', now());

create temporary table phase3_ids (
  evidence_document_id uuid,
  evidence_version_id uuid,
  job_id uuid,
  outbox_id uuid
);
grant select, insert, update on phase3_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000002","email":"contributor-alpha@example.test","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.create_evidence_document(
    'caaaaaaa-0000-0000-0000-000000000001',
    'caaaaaaa-1000-0000-0000-000000000001',
    'Access Policy', 'policy', 'governance_evidence', 'internal', 'internal_citation_only',
    'v1', '{"mode":"selected","products":["Core SaaS"],"environments":["production"],"regions":["global"]}'::jsonb,
    current_date, null, current_date + 365
  )$$,
  '42501',
  'Knowledge owner role required',
  'Contributors cannot admit evidence'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","email":"owner-alpha@example.test","role":"authenticated"}', true);

with created as (
  select * from public.create_evidence_document(
    'caaaaaaa-0000-0000-0000-000000000001',
    'caaaaaaa-1000-0000-0000-000000000001',
    'Access Policy', 'policy', 'governance_evidence', 'internal', 'internal_citation_only',
    'v1', '{"mode":"selected","legalEntities":[],"businessUnits":[],"products":["Core SaaS"],"environments":["production"],"regions":["global"],"dataClasses":[],"deploymentModels":[],"customerSegments":[],"customDimensions":{}}'::jsonb,
    current_date, null, current_date + 365
  )
)
insert into phase3_ids (evidence_document_id, evidence_version_id)
select evidence_document_id, evidence_version_id from created;

select is((select count(*)::integer from phase3_ids), 1, 'Knowledge owner creates one evidence document and version');
select is((select count(*)::integer from public.evidence_documents), 1, 'Alpha user sees one admitted document through RLS');
select is((select count(*)::integer from public.evidence_versions), 1, 'Alpha user sees one immutable version');

with queued as (
  select * from public.start_evidence_extraction(
    'caaaaaaa-0000-0000-0000-000000000001',
    (select evidence_version_id from phase3_ids),
    'caaaaaaa-2000-4000-8000-000000000001'
  )
)
update phase3_ids set job_id = queued.job_id, outbox_id = queued.outbox_id from queued;

select is((select count(*)::integer from public.jobs where type = 'extract_evidence'), 1, 'Extraction request creates one typed job');
select throws_ok(
  $$select count(*) from public.evidence_queue_outbox$$,
  '42501',
  null,
  'Normal users receive a hard denial on the privileged extraction outbox'
);

reset role;

select throws_ok(
  format(
    $$select public.complete_evidence_extraction(
      'caaaaaaa-0000-0000-0000-000000000001', %L, %L,
      '{"sourceSha256":"%s"}'::jsonb, '[]'::jsonb, '%s'
    )$$,
    (select evidence_version_id from phase3_ids),
    (select job_id from phase3_ids),
    repeat('f', 64),
    repeat('c', 64)
  ),
  '22023',
  'Manifest source hash mismatch',
  'A manifest for different bytes is rejected'
);

select public.complete_evidence_extraction(
  'caaaaaaa-0000-0000-0000-000000000001',
  (select evidence_version_id from phase3_ids),
  (select job_id from phase3_ids),
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceSha256', repeat('a', 64),
    'sourceMimeType', 'text/plain',
    'sourceFileName', 'access-policy.txt',
    'extractorName', 'test-extractor',
    'extractorVersion', '1.0.0',
    'normalizationRulesetVersion', 'phase3-v1',
    'scanStatus', 'clean',
    'startedAt', now() - interval '1 second',
    'completedAt', now(),
    'nodes', jsonb_build_array(jsonb_build_object(
      'id', 'node-1', 'parentId', null, 'type', 'paragraph', 'displayOrder', 1,
      'text', 'Production access rights are reviewed quarterly.',
      'normalizedText', 'Production access rights are reviewed quarterly.',
      'pageNumber', 1, 'sheetName', null, 'cellRange', null,
      'headingPath', jsonb_build_array('Access Control'),
      'paragraphIndex', 0, 'characterStart', 0, 'characterEnd', 48,
      'boundingBox', null, 'extractionMethod', 'native_text',
      'extractionConfidence', 0.99, 'flags', '[]'::jsonb, 'metadata', '{}'::jsonb
    )),
    'warnings', '[]'::jsonb,
    'quality', jsonb_build_object('coverage', 1, 'readingOrder', 1, 'structuralFidelity', 0.9, 'provenanceCompleteness', 1, 'overall', 0.95, 'requiresHumanReview', false),
    'statistics', jsonb_build_object('textCharacters', 48, 'nonEmptyNodes', 1, 'tableCount', 0, 'figureCount', 0, 'ocrNodeCount', 0)
  ),
  jsonb_build_array(jsonb_build_object(
    'localId', 'span-1', 'sourceNodeIds', jsonb_build_array('node-1'),
    'text', 'Production access rights are reviewed quarterly.',
    'normalizedText', 'Access Control Production access rights are reviewed quarterly.',
    'pageNumber', 1, 'sheetName', null, 'cellRange', null,
    'headingPath', jsonb_build_array('Access Control'),
    'extractionMethod', 'native_text', 'extractionConfidence', 0.99,
    'sourceLocation', jsonb_build_object('pageNumber', 1, 'firstNodeId', 'node-1', 'lastNodeId', 'node-1'),
    'contentHash', repeat('d', 64)
  )),
  repeat('c', 64)
);

select is((select count(*)::integer from public.evidence_spans), 1, 'Successful extraction creates an exact citable span');
select is((select extraction_status::text from public.evidence_versions where id = (select evidence_version_id from phase3_ids)), 'succeeded', 'Evidence version records extraction success');
select is((select lifecycle_status::text from public.evidence_versions where id = (select evidence_version_id from phase3_ids)), 'ready_for_review', 'High-quality clean extraction enters review instead of auto-approval');

select throws_ok(
  $$insert into public.evidence_spans (
    tenant_id, evidence_version_id, extraction_run_id, local_id, source_node_local_ids,
    text_content, normalized_text, extraction_method, extraction_confidence, source_location, content_hash
  ) values (
    'cbbbbbbb-0000-0000-0000-000000000001',
    (select evidence_version_id from phase3_ids),
    (select id from public.extraction_runs limit 1),
    'cross-tenant', array['node-1'], 'Wrong tenant', 'Wrong tenant',
    'native_text', 1, '{}'::jsonb, repeat('e',64)
  )$$,
  '23503',
  null,
  'Composite foreign keys reject cross-tenant provenance'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","email":"owner-alpha@example.test","role":"authenticated"}', true);

select lives_ok(
  format(
    $$select public.approve_evidence_version(
      'caaaaaaa-0000-0000-0000-000000000001', %L,
      'Reviewed provenance, scope, dates, classification, and extraction quality.', false
    )$$,
    (select evidence_version_id from phase3_ids)
  ),
  'Knowledge owner can approve clean reviewed evidence'
);

select is((select lifecycle_status::text from public.evidence_versions where id = (select evidence_version_id from phase3_ids)), 'approved', 'Approved version becomes retrieval eligible');
select is((select current_version_id from public.evidence_documents where id = (select evidence_document_id from phase3_ids)), (select evidence_version_id from phase3_ids), 'Logical document points to the approved current version');

select is(
  (select count(*)::integer from public.search_evidence(
    'caaaaaaa-0000-0000-0000-000000000001',
    'production access rights quarterly',
    '{"mode":"selected","legalEntities":[],"businessUnits":[],"products":["Core SaaS"],"environments":["production"],"regions":["global"],"dataClasses":[],"deploymentModels":[],"customerSegments":[]}'::jsonb,
    'internal_answer_support', false, 10
  )),
  1,
  'Approved compatible evidence is returned by lexical retrieval'
);

select is(
  (select count(*)::integer from public.search_evidence(
    'caaaaaaa-0000-0000-0000-000000000001',
    'production access rights quarterly',
    '{"mode":"selected","legalEntities":[],"businessUnits":[],"products":["Different Product"],"environments":["production"],"regions":["global"],"dataClasses":[],"deploymentModels":[],"customerSegments":[]}'::jsonb,
    'internal_answer_support', false, 10
  )),
  0,
  'Semantic relevance cannot override product scope mismatch'
);

select is(
  (select count(*)::integer from public.search_evidence(
    'caaaaaaa-0000-0000-0000-000000000001',
    'production access rights quarterly',
    '{"mode":"selected","legalEntities":[],"businessUnits":[],"products":["Core SaaS"],"environments":["production"],"regions":["global"],"dataClasses":[],"deploymentModels":[],"customerSegments":[]}'::jsonb,
    'external_quote', false, 10
  )),
  0,
  'Internal-only evidence is excluded from external quotation retrieval'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"32000000-0000-0000-0000-000000000001","email":"owner-beta@example.test","role":"authenticated"}', true);

select is((select count(*)::integer from public.evidence_documents), 0, 'Beta cannot see Alpha evidence metadata');
select is((select count(*)::integer from public.evidence_spans), 0, 'Beta cannot see Alpha evidence content');

select * from finish();
rollback;
