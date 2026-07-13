alter table public.generation_runs enable row level security;
alter table public.generation_candidates enable row level security;
alter table public.answer_revisions enable row level security;
alter table public.answer_claims enable row level security;
alter table public.answer_citations enable row level security;
alter table public.generation_queue_outbox enable row level security;

create policy generation_runs_authorized_select on public.generation_runs
for select to authenticated using (
  public.is_org_member(tenant_id)
  and (
    requested_by = auth.uid()
    or public.has_any_role(
      tenant_id,
      array['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
    )
  )
);

create policy generation_candidates_authorized_select on public.generation_candidates
for select to authenticated using (
  exists (
    select 1 from public.generation_runs run
    where run.tenant_id = generation_candidates.tenant_id
      and run.id = generation_candidates.generation_run_id
      and (
        run.requested_by = auth.uid()
        or public.has_any_role(
          run.tenant_id,
          array['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
        )
      )
  )
);

create policy answer_revisions_authorized_select on public.answer_revisions
for select to authenticated using (
  public.has_any_role(
    tenant_id,
    array['knowledge_owner', 'contributor', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
  )
);

create policy answer_claims_authorized_select on public.answer_claims
for select to authenticated using (
  public.has_any_role(
    tenant_id,
    array['knowledge_owner', 'contributor', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
  )
);

create policy answer_citations_authorized_select on public.answer_citations
for select to authenticated using (
  public.has_any_role(
    tenant_id,
    array['knowledge_owner', 'contributor', 'security_reviewer', 'legal_reviewer', 'final_approver', 'auditor']::public.membership_role[]
  )
);

revoke all on public.generation_runs,
  public.generation_candidates,
  public.answer_revisions,
  public.answer_claims,
  public.answer_citations,
  public.generation_queue_outbox from anon, authenticated;

grant select on public.generation_runs,
  public.generation_candidates,
  public.answer_revisions,
  public.answer_claims,
  public.answer_citations to authenticated;

revoke all on function public.request_answer_generation(
  uuid, uuid, uuid, public.generation_operation, text, text, text, text, integer, uuid
) from public;
revoke all on function public.persist_generation_input(uuid, uuid, text, jsonb, jsonb) from public;
revoke all on function public.complete_generation_run(uuid, uuid, jsonb, text) from public;
revoke all on function public.fail_generation_run(uuid, uuid, text, text, boolean) from public;

grant execute on function public.request_answer_generation(
  uuid, uuid, uuid, public.generation_operation, text, text, text, text, integer, uuid
) to authenticated;
grant execute on function public.persist_generation_input(uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.complete_generation_run(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.fail_generation_run(uuid, uuid, text, text, boolean) to service_role;
