create or replace function public.protect_questionnaire_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Questionnaire snapshots are immutable';
  end if;
  if new.tenant_id <> old.tenant_id
    or new.id <> old.id
    or new.questionnaire_artifact_id <> old.questionnaire_artifact_id
    or new.mapping_version_id <> old.mapping_version_id
    or new.snapshot_hash <> old.snapshot_hash
    or new.target_scope <> old.target_scope
    or new.question_count <> old.question_count
    or new.atomic_request_count <> old.atomic_request_count
    or new.frozen_by <> old.frozen_by
    or new.frozen_at <> old.frozen_at
  then
    raise exception using errcode = '42501', message = 'Frozen questionnaire snapshot identity is immutable';
  end if;
  if old.status in ('invalidated', 'exported') and new.status <> old.status then
    raise exception using errcode = '42501', message = 'Terminal questionnaire snapshot status is immutable';
  end if;
  return new;
end;
$$;

create trigger questionnaire_snapshots_protect_identity
before update or delete on public.questionnaire_snapshots
for each row execute function public.protect_questionnaire_snapshot();

alter table public.questionnaire_artifacts enable row level security;
alter table public.questionnaire_import_runs enable row level security;
alter table public.questionnaire_mapping_versions enable row level security;
alter table public.questionnaire_sections enable row level security;
alter table public.questionnaire_questions enable row level security;
alter table public.questionnaire_answer_destinations enable row level security;
alter table public.questionnaire_atomic_requests enable row level security;
alter table public.questionnaire_conditions enable row level security;
alter table public.questionnaire_instructions enable row level security;
alter table public.questionnaire_import_warnings enable row level security;
alter table public.questionnaire_snapshots enable row level security;
alter table public.questionnaire_mapping_templates enable row level security;
alter table public.questionnaire_export_plans enable row level security;
alter table public.questionnaire_export_operations enable row level security;
alter table public.questionnaire_export_runs enable row level security;
alter table public.questionnaire_export_diffs enable row level security;
alter table public.questionnaire_queue_outbox enable row level security;

create policy questionnaire_artifacts_member_select on public.questionnaire_artifacts
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_import_runs_member_select on public.questionnaire_import_runs
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_mappings_member_select on public.questionnaire_mapping_versions
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_sections_member_select on public.questionnaire_sections
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_questions_member_select on public.questionnaire_questions
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_destinations_member_select on public.questionnaire_answer_destinations
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_atomic_member_select on public.questionnaire_atomic_requests
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_conditions_member_select on public.questionnaire_conditions
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_instructions_member_select on public.questionnaire_instructions
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_warnings_member_select on public.questionnaire_import_warnings
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_snapshots_member_select on public.questionnaire_snapshots
for select to authenticated using (public.is_org_member(tenant_id));
create policy questionnaire_templates_member_select on public.questionnaire_mapping_templates
for select to authenticated using (public.is_org_member(tenant_id));

create policy questionnaire_export_plans_reviewer_select on public.questionnaire_export_plans
for select to authenticated using (
  public.has_any_role(
    tenant_id,
    array['security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
  )
);
create policy questionnaire_export_operations_reviewer_select on public.questionnaire_export_operations
for select to authenticated using (
  public.has_any_role(
    tenant_id,
    array['security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
  )
);
create policy questionnaire_export_runs_reviewer_select on public.questionnaire_export_runs
for select to authenticated using (
  public.has_any_role(
    tenant_id,
    array['security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
  )
);
create policy questionnaire_export_diffs_reviewer_select on public.questionnaire_export_diffs
for select to authenticated using (
  public.has_any_role(
    tenant_id,
    array['security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
  )
);

revoke all on public.questionnaire_artifacts,
  public.questionnaire_import_runs,
  public.questionnaire_mapping_versions,
  public.questionnaire_sections,
  public.questionnaire_questions,
  public.questionnaire_answer_destinations,
  public.questionnaire_atomic_requests,
  public.questionnaire_conditions,
  public.questionnaire_instructions,
  public.questionnaire_import_warnings,
  public.questionnaire_snapshots,
  public.questionnaire_mapping_templates,
  public.questionnaire_export_plans,
  public.questionnaire_export_operations,
  public.questionnaire_export_runs,
  public.questionnaire_export_diffs,
  public.questionnaire_queue_outbox from anon, authenticated;

grant select on public.questionnaire_artifacts,
  public.questionnaire_import_runs,
  public.questionnaire_mapping_versions,
  public.questionnaire_sections,
  public.questionnaire_questions,
  public.questionnaire_answer_destinations,
  public.questionnaire_atomic_requests,
  public.questionnaire_conditions,
  public.questionnaire_instructions,
  public.questionnaire_import_warnings,
  public.questionnaire_snapshots,
  public.questionnaire_mapping_templates,
  public.questionnaire_export_plans,
  public.questionnaire_export_operations,
  public.questionnaire_export_runs,
  public.questionnaire_export_diffs to authenticated;

revoke all on function public.create_questionnaire_artifact(uuid, uuid, public.questionnaire_format) from public;
revoke all on function public.start_questionnaire_import(uuid, uuid, uuid) from public;
revoke all on function public.complete_questionnaire_import(uuid, uuid, uuid, jsonb, text) from public;
revoke all on function public.create_questionnaire_mapping_revision(uuid, uuid, jsonb, jsonb, text) from public;
revoke all on function public.resolve_questionnaire_warning(uuid, uuid, text) from public;
revoke all on function public.freeze_questionnaire_snapshot(uuid, uuid, text, jsonb) from public;
revoke all on function public.create_questionnaire_export_plan(uuid, uuid, text, jsonb, text[]) from public;
revoke all on function public.validate_questionnaire_export_plan(uuid, uuid) from public;
revoke all on function public.start_questionnaire_export(uuid, uuid, uuid, uuid) from public;
revoke all on function public.complete_questionnaire_export(uuid, uuid, text, bigint, text[], text[], jsonb) from public;

grant execute on function public.create_questionnaire_artifact(uuid, uuid, public.questionnaire_format) to authenticated;
grant execute on function public.start_questionnaire_import(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_questionnaire_mapping_revision(uuid, uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.resolve_questionnaire_warning(uuid, uuid, text) to authenticated;
grant execute on function public.freeze_questionnaire_snapshot(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.create_questionnaire_export_plan(uuid, uuid, text, jsonb, text[]) to authenticated;
grant execute on function public.validate_questionnaire_export_plan(uuid, uuid) to authenticated;
grant execute on function public.start_questionnaire_export(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.complete_questionnaire_import(uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.complete_questionnaire_export(uuid, uuid, text, bigint, text[], text[], jsonb) to service_role;
