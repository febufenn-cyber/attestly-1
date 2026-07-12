create or replace function public.protect_evidence_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.tenant_id <> old.tenant_id or new.id <> old.id or new.evidence_document_id <> old.evidence_document_id
    or new.stored_object_id <> old.stored_object_id or new.source_sha256 <> old.source_sha256
  then
    raise exception using errcode = '42501', message = 'Evidence version identity is immutable';
  end if;
  return new;
end;
$$;
create trigger evidence_versions_protect_identity
before update on public.evidence_versions
for each row execute function public.protect_evidence_identity();

create or replace function public.array_scope_match(
  p_requested text[],
  p_candidate text[],
  p_mode public.scope_mode
)
returns public.scope_match_result
language plpgsql
immutable
set search_path = public
as $$
declare
  requested_count integer := cardinality(coalesce(p_requested, '{}'));
  candidate_count integer := cardinality(coalesce(p_candidate, '{}'));
  overlap_count integer;
begin
  if p_mode = 'unknown' then return 'unknown'; end if;
  if p_mode = 'all' then return 'compatible'; end if;
  if requested_count = 0 then return 'compatible'; end if;
  select count(*) into overlap_count
  from (
    select lower(value) value from unnest(coalesce(p_requested, '{}')) value
    intersect
    select lower(value) value from unnest(coalesce(p_candidate, '{}')) value
  ) overlap;
  if overlap_count = 0 then return 'mismatch'; end if;
  if overlap_count = requested_count and overlap_count = candidate_count then return 'exact'; end if;
  if overlap_count = requested_count then return 'compatible'; end if;
  return 'partial';
end;
$$;

create or replace function public.evidence_scope_match(
  p_requested jsonb,
  p_scope public.evidence_scopes
)
returns public.scope_match_result
language plpgsql
stable
set search_path = public
as $$
declare
  results public.scope_match_result[];
  item public.scope_match_result;
begin
  results := array[
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'legalEntities', '[]'::jsonb))), p_scope.legal_entities, p_scope.mode),
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'businessUnits', '[]'::jsonb))), p_scope.business_units, p_scope.mode),
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'products', '[]'::jsonb))), p_scope.products, p_scope.mode),
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'environments', '[]'::jsonb))), p_scope.environments, p_scope.mode),
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'regions', '[]'::jsonb))), p_scope.regions, p_scope.mode),
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'dataClasses', '[]'::jsonb))), p_scope.data_classes, p_scope.mode),
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'deploymentModels', '[]'::jsonb))), p_scope.deployment_models, p_scope.mode),
    public.array_scope_match(array(select jsonb_array_elements_text(coalesce(p_requested->'customerSegments', '[]'::jsonb))), p_scope.customer_segments, p_scope.mode)
  ];
  foreach item in array results loop if item = 'mismatch' then return 'mismatch'; end if; end loop;
  foreach item in array results loop if item = 'unknown' then return 'unknown'; end if; end loop;
  foreach item in array results loop if item = 'partial' then return 'partial'; end if; end loop;
  if results <@ array['exact'::public.scope_match_result] then return 'exact'; end if;
  return 'compatible';
end;
$$;

create or replace function public.may_read_evidence_content(
  p_tenant_id uuid,
  p_confidentiality public.evidence_confidentiality
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_org_member(p_tenant_id)
    and (
      p_confidentiality <> 'restricted'
      or public.has_any_role(
        p_tenant_id,
        array['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
      )
    );
$$;

create or replace function public.evidence_authority_score(p_class public.evidence_class)
returns numeric
language sql
immutable
as $$
  select case p_class
    when 'independent_attestation' then 1.0
    when 'operational_proof' then 0.95
    when 'implementation_documentation' then 0.82
    when 'governance_evidence' then 0.70
    when 'historical_representation' then 0.42
    when 'unverified_statement' then 0.15
  end::numeric;
$$;
