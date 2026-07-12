begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contributor-alpha@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-beta@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Tenant Alpha', 'tenant-alpha', '10000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Tenant Beta', 'tenant-beta', '20000000-0000-0000-0000-000000000001');

insert into public.organization_memberships (tenant_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'contributor'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin');

insert into public.stored_objects (
  tenant_id, id, storage_bucket, storage_path, file_name,
  declared_mime_type, size_bytes, created_by
) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/aaaaaaaa-0000-0000-0000-000000000001/objects/aaaaaaaa-1000-0000-0000-000000000001/original', 'security-policy.pdf', 'application/pdf', 100, '10000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1000-0000-0000-000000000001', 'attestly-evidence', 'tenant/bbbbbbbb-0000-0000-0000-000000000001/objects/bbbbbbbb-1000-0000-0000-000000000001/original', 'security-policy.pdf', 'application/pdf', 100, '20000000-0000-0000-0000-000000000001');

insert into public.audit_events (
  tenant_id, actor_type, actor_id, action, target_type, target_id, request_id
) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'user', '10000000-0000-0000-0000-000000000001', 'test.alpha', 'organization', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'user', '20000000-0000-0000-0000-000000000001', 'test.beta', 'organization', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-2000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-alpha@example.test","role":"authenticated"}', true);

select is((select count(*)::integer from public.organizations), 1, 'Alpha admin sees exactly one organization');
select ok(exists(select 1 from public.organizations where slug = 'tenant-alpha'), 'Alpha admin sees Alpha');
select ok(not exists(select 1 from public.organizations where slug = 'tenant-beta'), 'Alpha admin cannot see Beta');
select is((select count(*)::integer from public.stored_objects), 1, 'Alpha admin sees one tenant-owned object');
select ok(not exists(select 1 from public.stored_objects where file_name = 'security-policy.pdf' and tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'Alpha cannot retrieve Beta object even with the same filename');
select is((select count(*)::integer from public.audit_events), 1, 'Alpha admin sees only Alpha audit events');

select throws_ok(
  $$update public.audit_events set action = 'tampered' where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Authenticated users cannot mutate append-only audit events'
);

select throws_ok(
  $$select public.remove_member('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$,
  '22023',
  'The last administrator cannot be removed',
  'The last administrator is protected'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"contributor-alpha@example.test","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.create_invitation('aaaaaaaa-0000-0000-0000-000000000001', 'new@example.test', 'contributor', 'abcdefghijklmnopqrstuvwxyz0123456789', now() + interval '1 day')$$,
  '42501',
  'Administrator role required',
  'Contributors cannot create invitations'
);

select ok(
  public.may_upload_storage_object(
    'attestly-evidence',
    'tenant/aaaaaaaa-0000-0000-0000-000000000001/objects/aaaaaaaa-1000-0000-0000-000000000001/original'
  ) = false,
  'A contributor cannot upload into an object intent created by another user'
);

reset role;

select throws_ok(
  $$insert into public.jobs (tenant_id, type, object_id, idempotency_key, correlation_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'validate_object', 'bbbbbbbb-1000-0000-0000-000000000001', 'cross-tenant', gen_random_uuid())$$,
  '23503',
  null,
  'Composite foreign keys reject cross-tenant object references'
);

select is(
  public.storage_object_tenant('tenant/aaaaaaaa-0000-0000-0000-000000000001/objects/one/original'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'Storage paths resolve an explicit tenant identity'
);

select * from finish();
rollback;
