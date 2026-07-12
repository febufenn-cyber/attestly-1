alter table public.evidence_scopes enable row level security;
alter table public.evidence_documents enable row level security;
alter table public.evidence_versions enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.extraction_nodes enable row level security;
alter table public.extraction_warnings enable row level security;
alter table public.evidence_spans enable row level security;
alter table public.evidence_span_embeddings enable row level security;
alter table public.evidence_approvals enable row level security;
alter table public.evidence_relations enable row level security;
alter table public.evidence_queue_outbox enable row level security;
alter table public.retrieval_runs enable row level security;
alter table public.retrieval_candidates enable row level security;

create policy evidence_scopes_member_select on public.evidence_scopes for select to authenticated using (public.is_org_member(tenant_id));
create policy evidence_documents_member_select on public.evidence_documents for select to authenticated using (public.is_org_member(tenant_id));
create policy evidence_versions_member_select on public.evidence_versions for select to authenticated using (public.is_org_member(tenant_id));
create policy extraction_runs_member_select on public.extraction_runs for select to authenticated using (public.is_org_member(tenant_id));
create policy extraction_nodes_authorized_select on public.extraction_nodes for select to authenticated using (
  exists (
    select 1 from public.evidence_versions version
    join public.evidence_documents document on document.tenant_id = version.tenant_id and document.id = version.evidence_document_id
    where version.tenant_id = extraction_nodes.tenant_id and version.id = extraction_nodes.evidence_version_id
      and public.may_read_evidence_content(document.tenant_id, document.confidentiality)
  )
);
create policy extraction_warnings_authorized_select on public.extraction_warnings for select to authenticated using (
  exists (
    select 1 from public.evidence_versions version
    join public.evidence_documents document on document.tenant_id = version.tenant_id and document.id = version.evidence_document_id
    where version.tenant_id = extraction_warnings.tenant_id and version.id = extraction_warnings.evidence_version_id
      and public.may_read_evidence_content(document.tenant_id, document.confidentiality)
  )
);
create policy evidence_spans_authorized_select on public.evidence_spans for select to authenticated using (
  exists (
    select 1 from public.evidence_versions version
    join public.evidence_documents document on document.tenant_id = version.tenant_id and document.id = version.evidence_document_id
    where version.tenant_id = evidence_spans.tenant_id and version.id = evidence_spans.evidence_version_id
      and public.may_read_evidence_content(document.tenant_id, document.confidentiality)
  )
);
create policy evidence_approvals_member_select on public.evidence_approvals for select to authenticated using (public.is_org_member(tenant_id));
create policy evidence_relations_member_select on public.evidence_relations for select to authenticated using (public.is_org_member(tenant_id));
create policy retrieval_runs_own_select on public.retrieval_runs for select to authenticated using (public.is_org_member(tenant_id) and actor_user_id = auth.uid());
create policy retrieval_candidates_own_select on public.retrieval_candidates for select to authenticated using (
  exists (select 1 from public.retrieval_runs run where run.tenant_id = retrieval_candidates.tenant_id
    and run.id = retrieval_candidates.retrieval_run_id and run.actor_user_id = auth.uid())
);

grant select on public.evidence_scopes, public.evidence_documents, public.evidence_versions,
  public.extraction_runs, public.extraction_nodes, public.extraction_warnings,
  public.evidence_spans, public.evidence_approvals, public.evidence_relations,
  public.retrieval_runs, public.retrieval_candidates to authenticated;

revoke all on function public.create_evidence_document(uuid, uuid, text, text, public.evidence_class,
  public.evidence_confidentiality, public.evidence_disclosure_policy, text, jsonb, date, date, date) from public;
revoke all on function public.start_evidence_extraction(uuid, uuid, uuid) from public;
revoke all on function public.complete_evidence_extraction(uuid, uuid, uuid, jsonb, jsonb, text) from public;
revoke all on function public.approve_evidence_version(uuid, uuid, text, boolean) from public;
revoke all on function public.search_evidence(uuid, text, jsonb, text, boolean, integer) from public;

grant execute on function public.create_evidence_document(uuid, uuid, text, text, public.evidence_class,
  public.evidence_confidentiality, public.evidence_disclosure_policy, text, jsonb, date, date, date) to authenticated;
grant execute on function public.start_evidence_extraction(uuid, uuid, uuid) to authenticated;
grant execute on function public.complete_evidence_extraction(uuid, uuid, uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.approve_evidence_version(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.search_evidence(uuid, text, jsonb, text, boolean, integer) to authenticated;
