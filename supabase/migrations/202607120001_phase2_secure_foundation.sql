-- Attestly Phase 2 secure foundation
-- Multi-tenant ownership, RLS, immutable storage metadata, jobs/outbox, invitations, and audit.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create type public.membership_role as enum (
  'admin',
  'knowledge_owner',
  'contributor',
  'security_reviewer',
  'legal_reviewer',
  'final_approver',
  'auditor'
);

create type public.membership_status as enum ('active', 'removed');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.object_status as enum (
  'upload_requested',
  'uploaded',
  'validating',
  'accepted',
  'validation_failed',
  'retired',
  'deletion_requested',
  'deleted'
);
create type public.job_type as enum ('validate_object');
create type public.job_status as enum (
  'pending',
  'leased',
  'running',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'cancelled'
);
create type public.audit_actor_type as enum ('user', 'service', 'system');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deletion_requested_at timestamptz,
  deleted_at timestamptz
);

create table public.organization_memberships (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (tenant_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  email extensions.citext not null,
  role public.membership_role not null,
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_not_admin check (role <> 'admin')
);

create table public.workspace_settings (
  tenant_id uuid primary key references public.organizations(id) on delete cascade,
  retention_days integer not null default 365 check (retention_days between 1 and 3650),
  region text not null default 'unset',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stored_objects (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  declared_mime_type text not null,
  detected_mime_type text,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  status public.object_status not null default 'upload_requested',
  validation_error_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  retired_at timestamptz,
  deleted_at timestamptz,
  primary key (tenant_id, id),
  unique (storage_bucket, storage_path),
  unique (tenant_id, storage_path)
);

create table public.jobs (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  type public.job_type not null,
  status public.job_status not null default 'pending',
  object_id uuid,
  idempotency_key text not null,
  payload_version integer not null default 1 check (payload_version > 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  lease_owner uuid,
  lease_expires_at timestamptz,
  correlation_id uuid not null,
  created_by uuid references auth.users(id),
  last_error_code text,
  last_error_detail text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, idempotency_key),
  constraint jobs_object_fk foreign key (tenant_id, object_id)
    references public.stored_objects(tenant_id, id) on delete restrict
);

create table public.job_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  job_id uuid not null,
  from_status public.job_status,
  to_status public.job_status not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint job_events_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete cascade
);

create table public.queue_outbox (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  job_id uuid not null,
  topic text not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0 check (dispatch_attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, job_id),
  constraint queue_outbox_job_fk foreign key (tenant_id, job_id)
    references public.jobs(tenant_id, id) on delete cascade
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  actor_type public.audit_actor_type not null,
  actor_id uuid,
  action text not null check (char_length(action) between 3 and 160),
  target_type text not null check (char_length(target_type) between 2 and 120),
  target_id uuid,
  request_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index organization_memberships_user_idx
  on public.organization_memberships(user_id, status, tenant_id);
create index invitations_tenant_status_idx on public.invitations(tenant_id, status, expires_at);
create index stored_objects_tenant_created_idx on public.stored_objects(tenant_id, created_at desc);
create index jobs_tenant_created_idx on public.jobs(tenant_id, created_at desc);
create index jobs_retry_idx on public.jobs(status, lease_expires_at) where status in ('leased', 'failed_retryable');
create index queue_outbox_pending_idx on public.queue_outbox(available_at, created_at) where dispatched_at is null;
create index audit_events_tenant_time_idx on public.audit_events(tenant_id, occurred_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

create trigger workspace_settings_touch_updated_at
before update on public.workspace_settings
for each row execute function public.touch_updated_at();

create trigger stored_objects_touch_updated_at
before update on public.stored_objects
for each row execute function public.touch_updated_at();

create or replace function public.record_job_status_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into public.job_events (tenant_id, job_id, from_status, to_status, detail)
    values (
      new.tenant_id,
      new.id,
      old.status,
      new.status,
      jsonb_build_object('attempt_count', new.attempt_count)
    );
  end if;
  return new;
end;
$$;

create trigger jobs_record_status_change
after update of status on public.jobs
for each row execute function public.record_job_status_change();

create or replace function public.protect_stored_object_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.tenant_id <> old.tenant_id
    or new.id <> old.id
    or new.storage_bucket <> old.storage_bucket
    or new.storage_path <> old.storage_path
    or new.created_by <> old.created_by
  then
    raise exception using errcode = '42501', message = 'Stored object identity is immutable';
  end if;
  return new;
end;
$$;

create trigger stored_objects_protect_identity
before update on public.stored_objects
for each row execute function public.protect_stored_object_identity();

create or replace function public.protect_audit_events()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception using errcode = '42501', message = 'Audit events are append-only';
end;
$$;

create trigger audit_events_no_update
before update or delete on public.audit_events
for each row execute function public.protect_audit_events();

create or replace function public.is_org_member(p_tenant_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select p_user_id is not null and exists (
    select 1
    from public.organization_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = p_user_id
      and membership.status = 'active'
  );
$$;

create or replace function public.current_membership_role(p_tenant_id uuid)
returns public.membership_role
language sql
stable
security definer
set search_path = public, auth
as $$
  select membership.role
  from public.organization_memberships membership
  where membership.tenant_id = p_tenant_id
    and membership.user_id = auth.uid()
    and membership.status = 'active';
$$;

create or replace function public.has_any_role(
  p_tenant_id uuid,
  p_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.current_membership_role(p_tenant_id) = any(p_roles), false);
$$;

create or replace function public.storage_object_tenant(p_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = public, storage
as $$
declare
  folders text[];
begin
  folders := storage.foldername(p_name);
  if array_length(folders, 1) < 2 or folders[1] <> 'tenant' then
    return null;
  end if;
  return folders[2]::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.may_upload_storage_object(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.stored_objects object
    where object.tenant_id = public.storage_object_tenant(p_name)
      and object.storage_bucket = p_bucket
      and object.storage_path = p_name
      and object.created_by = auth.uid()
      and object.status = 'upload_requested'
      and public.has_any_role(
        object.tenant_id,
        array['admin', 'knowledge_owner', 'contributor']::public.membership_role[]
      )
  );
$$;

create or replace function public.create_organization(p_name text, p_slug text)
returns table (id uuid, name text, slug text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  organization public.organizations;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if char_length(trim(p_name)) not between 2 and 120
    or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  then
    raise exception using errcode = '22023', message = 'Invalid organization name or slug';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), p_slug, auth.uid())
  returning * into organization;

  insert into public.organization_memberships (tenant_id, user_id, role, status)
  values (organization.id, auth.uid(), 'admin', 'active');

  insert into public.workspace_settings (tenant_id) values (organization.id);

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    organization.id, 'user', auth.uid(), 'workspace.created', 'organization', organization.id,
    gen_random_uuid(), jsonb_build_object('slug', organization.slug)
  );

  return query select organization.id, organization.name, organization.slug, organization.created_at;
end;
$$;

create or replace function public.create_invitation(
  p_tenant_id uuid,
  p_email text,
  p_role public.membership_role,
  p_token text,
  p_expires_at timestamptz
)
returns table (id uuid, email text, role public.membership_role, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  invitation public.invitations;
begin
  if not public.has_any_role(p_tenant_id, array['admin']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Administrator role required';
  end if;
  if p_role = 'admin' then
    raise exception using errcode = '22023', message = 'Admin invitations require a later privileged workflow';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception using errcode = '22023', message = 'Invalid invitation expiry';
  end if;

  update public.invitations
  set status = 'revoked'
  where tenant_id = p_tenant_id and email = lower(trim(p_email)) and status = 'pending';

  insert into public.invitations (
    tenant_id, email, role, token_hash, invited_by, expires_at
  ) values (
    p_tenant_id,
    lower(trim(p_email)),
    p_role,
    encode(digest(p_token, 'sha256'), 'hex'),
    auth.uid(),
    p_expires_at
  ) returning * into invitation;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'member.invited', 'invitation', invitation.id,
    gen_random_uuid(), jsonb_build_object('role', p_role, 'expires_at', p_expires_at)
  );

  return query select invitation.id, invitation.email::text, invitation.role, invitation.expires_at;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  invitation public.invitations;
  jwt_email text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into invitation
  from public.invitations candidate
  where candidate.token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or invitation.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Invitation is invalid';
  end if;
  if invitation.expires_at <= now() then
    update public.invitations set status = 'expired' where id = invitation.id;
    raise exception using errcode = '22023', message = 'Invitation has expired';
  end if;
  if jwt_email = '' or jwt_email <> lower(invitation.email::text) then
    raise exception using errcode = '42501', message = 'Invitation email does not match the signed-in user';
  end if;

  insert into public.organization_memberships (tenant_id, user_id, role, status, invited_by)
  values (invitation.tenant_id, auth.uid(), invitation.role, 'active', invitation.invited_by)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role, status = 'active', removed_at = null, joined_at = now();

  update public.invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invitation.id;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    invitation.tenant_id, 'user', auth.uid(), 'member.invitation_accepted', 'membership', auth.uid(),
    gen_random_uuid(), jsonb_build_object('role', invitation.role)
  );

  return invitation.tenant_id;
end;
$$;

create or replace function public.remove_member(p_tenant_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role public.membership_role;
  remaining_admins integer;
begin
  if not public.has_any_role(p_tenant_id, array['admin']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Administrator role required';
  end if;

  select role into target_role
  from public.organization_memberships
  where tenant_id = p_tenant_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active membership not found';
  end if;

  if target_role = 'admin' then
    select count(*) into remaining_admins
    from public.organization_memberships
    where tenant_id = p_tenant_id and role = 'admin' and status = 'active' and user_id <> p_user_id;
    if remaining_admins < 1 then
      raise exception using errcode = '22023', message = 'The last administrator cannot be removed';
    end if;
  end if;

  update public.organization_memberships
  set status = 'removed', removed_at = now()
  where tenant_id = p_tenant_id and user_id = p_user_id;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'member.removed', 'membership', p_user_id,
    gen_random_uuid(), jsonb_build_object('previous_role', target_role)
  );
end;
$$;

create or replace function public.create_upload_intent(
  p_tenant_id uuid,
  p_object_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_declared_mime_type text,
  p_size_bytes bigint
)
returns table (id uuid, status public.object_status, storage_path text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  object public.stored_objects;
  expected_path text;
begin
  if not public.has_any_role(
    p_tenant_id,
    array['admin', 'knowledge_owner', 'contributor']::public.membership_role[]
  ) then
    raise exception using errcode = '42501', message = 'Upload permission required';
  end if;
  expected_path := format('tenant/%s/objects/%s/original', p_tenant_id, p_object_id);
  if p_storage_path <> expected_path or p_storage_bucket <> 'attestly-evidence' then
    raise exception using errcode = '22023', message = 'Invalid object storage identity';
  end if;

  insert into public.stored_objects (
    tenant_id, id, storage_bucket, storage_path, file_name,
    declared_mime_type, size_bytes, created_by
  ) values (
    p_tenant_id, p_object_id, p_storage_bucket, p_storage_path, p_file_name,
    p_declared_mime_type, p_size_bytes, auth.uid()
  ) returning * into object;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'object.upload_requested', 'stored_object', object.id,
    gen_random_uuid(), jsonb_build_object('file_name', p_file_name, 'size_bytes', p_size_bytes)
  );

  return query select object.id, object.status, object.storage_path;
end;
$$;

create or replace function public.complete_object_upload(
  p_tenant_id uuid,
  p_object_id uuid,
  p_correlation_id uuid
)
returns table (job_id uuid, outbox_id uuid)
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  object public.stored_objects;
  created_job public.jobs;
  created_outbox public.queue_outbox;
  idempotency text;
begin
  if not public.has_any_role(
    p_tenant_id,
    array['admin', 'knowledge_owner', 'contributor']::public.membership_role[]
  ) then
    raise exception using errcode = '42501', message = 'Upload permission required';
  end if;

  select * into object
  from public.stored_objects
  where tenant_id = p_tenant_id and id = p_object_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Object not found';
  end if;
  if object.created_by <> auth.uid() and not public.has_any_role(p_tenant_id, array['admin']::public.membership_role[]) then
    raise exception using errcode = '42501', message = 'Only the uploader or an administrator may complete this upload';
  end if;
  if not exists (
    select 1 from storage.objects storage_object
    where storage_object.bucket_id = object.storage_bucket and storage_object.name = object.storage_path
  ) then
    raise exception using errcode = '22023', message = 'Storage upload has not completed';
  end if;

  idempotency := format('validate_object:%s', object.id);
  select * into created_job
  from public.jobs
  where tenant_id = p_tenant_id and idempotency_key = idempotency;

  if not found then
    update public.stored_objects
    set status = 'uploaded'
    where tenant_id = p_tenant_id and id = p_object_id and status = 'upload_requested';

    insert into public.jobs (
      tenant_id, type, status, object_id, idempotency_key,
      correlation_id, created_by, max_attempts
    ) values (
      p_tenant_id, 'validate_object', 'pending', object.id, idempotency,
      p_correlation_id, auth.uid(), 3
    ) returning * into created_job;
  end if;

  insert into public.queue_outbox (tenant_id, job_id, topic, payload)
  values (
    p_tenant_id,
    created_job.id,
    'validate_object',
    jsonb_build_object(
      'version', 1,
      'type', 'validate_object',
      'tenantId', p_tenant_id,
      'objectId', object.id,
      'jobId', created_job.id,
      'correlationId', p_correlation_id
    )
  )
  on conflict (tenant_id, job_id) do update set tenant_id = excluded.tenant_id
  returning * into created_outbox;

  insert into public.audit_events (
    tenant_id, actor_type, actor_id, action, target_type, target_id, request_id, metadata
  ) values (
    p_tenant_id, 'user', auth.uid(), 'object.upload_completed', 'stored_object', object.id,
    p_correlation_id, jsonb_build_object('job_id', created_job.id)
  );

  return query select created_job.id, created_outbox.id;
end;
$$;

create or replace function public.lease_job(
  p_tenant_id uuid,
  p_job_id uuid,
  p_lease_owner uuid,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if p_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'Invalid lease duration';
  end if;

  update public.jobs
  set status = 'leased',
      lease_owner = p_lease_owner,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      started_at = coalesce(started_at, now()),
      failed_at = null
  where tenant_id = p_tenant_id
    and id = p_job_id
    and attempt_count < max_attempts
    and (
      status in ('pending', 'failed_retryable')
      or (status = 'leased' and lease_expires_at < now())
    );
  get diagnostics changed = row_count;

  return changed = 1;
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.stored_objects enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.queue_outbox enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_member_select on public.organizations
for select to authenticated
using (public.is_org_member(id));

create policy memberships_member_select on public.organization_memberships
for select to authenticated
using (public.is_org_member(tenant_id));

create policy invitations_admin_select on public.invitations
for select to authenticated
using (public.has_any_role(tenant_id, array['admin']::public.membership_role[]));

create policy workspace_settings_member_select on public.workspace_settings
for select to authenticated
using (public.is_org_member(tenant_id));

create policy stored_objects_member_select on public.stored_objects
for select to authenticated
using (public.is_org_member(tenant_id));

create policy jobs_member_select on public.jobs
for select to authenticated
using (public.is_org_member(tenant_id));

create policy job_events_member_select on public.job_events
for select to authenticated
using (public.is_org_member(tenant_id));

create policy audit_events_privileged_select on public.audit_events
for select to authenticated
using (
  public.has_any_role(
    tenant_id,
    array['admin', 'auditor']::public.membership_role[]
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attestly-evidence',
  'attestly-evidence',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/csv'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_storage_member_read on storage.objects
for select to authenticated
using (
  bucket_id = 'attestly-evidence'
  and public.is_org_member(public.storage_object_tenant(name))
);

create policy evidence_storage_intent_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'attestly-evidence'
  and public.may_upload_storage_object(bucket_id, name)
);

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.organizations,
  public.organization_memberships,
  public.invitations,
  public.workspace_settings,
  public.stored_objects,
  public.jobs,
  public.job_events,
  public.audit_events to authenticated;

revoke all on function public.create_organization(text, text) from public;
revoke all on function public.create_invitation(uuid, text, public.membership_role, text, timestamptz) from public;
revoke all on function public.accept_invitation(text) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
revoke all on function public.create_upload_intent(uuid, uuid, text, text, text, text, bigint) from public;
revoke all on function public.complete_object_upload(uuid, uuid, uuid) from public;
revoke all on function public.lease_job(uuid, uuid, uuid, integer) from public;

grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.membership_role, text, timestamptz) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.create_upload_intent(uuid, uuid, text, text, text, text, bigint) to authenticated;
grant execute on function public.complete_object_upload(uuid, uuid, uuid) to authenticated;
grant execute on function public.lease_job(uuid, uuid, uuid, integer) to service_role;
-- lease_job is intentionally not granted to authenticated; service-role workers call it.
