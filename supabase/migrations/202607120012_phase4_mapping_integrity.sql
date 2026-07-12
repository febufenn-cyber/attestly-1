-- Strengthen Phase 4 mapping integrity after the initial lifecycle functions.

create or replace function public.derive_questionnaire_destination_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_question text;
begin
  if new.question_local_id is null then
    select question.local_id into matched_question
    from public.questionnaire_questions question
    where question.tenant_id = new.tenant_id
      and question.mapping_version_id = new.mapping_version_id
      and (
        replace(new.local_id, 'destination-', 'question-') = question.local_id
        or exists (
          select 1
          from public.questionnaire_import_runs import_run
          join public.questionnaire_mapping_versions mapping
            on mapping.tenant_id = import_run.tenant_id
           and mapping.import_run_id = import_run.id
          cross join lateral jsonb_array_elements(coalesce(import_run.manifest->'questions', '[]'::jsonb)) manifest_question
          where mapping.tenant_id = new.tenant_id
            and mapping.id = new.mapping_version_id
            and manifest_question->>'localId' = question.local_id
            and coalesce(manifest_question->'answerDestinationLocalIds', '[]'::jsonb) ? new.local_id
        )
      )
    order by case when replace(new.local_id, 'destination-', 'question-') = question.local_id then 0 else 1 end
    limit 1;
    new.question_local_id := matched_question;
  end if;

  if new.question_local_id is null then
    raise exception using errcode = '23514', message = 'Every answer destination must belong to exactly one question';
  end if;
  return new;
end;
$$;

create trigger questionnaire_destinations_require_owner
before insert or update of question_local_id, local_id, mapping_version_id
on public.questionnaire_answer_destinations
for each row execute function public.derive_questionnaire_destination_owner();

alter table public.questionnaire_answer_destinations
  add constraint questionnaire_destination_question_fk
  foreign key (tenant_id, mapping_version_id, question_local_id)
  references public.questionnaire_questions(tenant_id, mapping_version_id, local_id)
  on delete cascade;

alter function public.create_questionnaire_mapping_revision(uuid, uuid, jsonb, jsonb, text)
  rename to create_questionnaire_mapping_revision_internal;

revoke all on function public.create_questionnaire_mapping_revision_internal(uuid, uuid, jsonb, jsonb, text)
from public, anon, authenticated;

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
  revision_id uuid;
begin
  revision_id := public.create_questionnaire_mapping_revision_internal(
    p_tenant_id,
    p_parent_mapping_version_id,
    p_mapping,
    p_target_scope,
    p_notes
  );

  if not exists (
    select 1
    from public.questionnaire_atomic_requests
    where tenant_id = p_tenant_id and mapping_version_id = revision_id
  ) then
    insert into public.questionnaire_atomic_requests (
      tenant_id, mapping_version_id, question_local_id, local_id,
      sequence, original_clause, normalized_claim, qualifiers, materiality
    )
    select
      parent.tenant_id,
      revision_id,
      parent.question_local_id,
      parent.local_id,
      parent.sequence,
      parent.original_clause,
      parent.normalized_claim,
      parent.qualifiers,
      parent.materiality
    from public.questionnaire_atomic_requests parent
    where parent.tenant_id = p_tenant_id
      and parent.mapping_version_id = p_parent_mapping_version_id
      and exists (
        select 1
        from public.questionnaire_questions child_question
        where child_question.tenant_id = p_tenant_id
          and child_question.mapping_version_id = revision_id
          and child_question.local_id = parent.question_local_id
      );
  end if;

  return revision_id;
end;
$$;

revoke all on function public.create_questionnaire_mapping_revision(uuid, uuid, jsonb, jsonb, text)
from public;
grant execute on function public.create_questionnaire_mapping_revision(uuid, uuid, jsonb, jsonb, text)
to authenticated;
