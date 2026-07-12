import { createClient, type Session } from '@supabase/supabase-js';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const apiUrl = import.meta.env.VITE_EVIDENCE_API_URL as string | undefined;
if (!supabaseUrl || !supabaseAnonKey || !apiUrl) throw new Error('Evidence console environment is incomplete.');
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

type Workspace = { tenant_id: string; role: string; organizations: { id: string; name: string; slug: string } };
type StoredObject = { id: string; file_name: string; detected_mime_type: string | null; declared_mime_type: string; size_bytes: number; sha256: string; created_at: string };
type VersionSummary = { id: string; version_label: string; lifecycle_status: string; extraction_status: string; index_status: string; malware_scan_status: string; extraction_quality: number | null; review_due_at: string | null; created_at: string };
type EvidenceDocument = { id: string; title: string; source_type: string; evidence_class: string; confidentiality: string; disclosure_policy: string; lifecycle_status: string; current_version_id: string | null; evidence_versions: VersionSummary[] };
type Span = { id: string; local_id: string; text_content: string; page_number: number | null; sheet_name: string | null; cell_range: string | null; heading_path: string[]; extraction_method: string; extraction_confidence: number };
type Warning = { id: string; code: string; severity: string; message: string; page_number: number | null; sheet_name: string | null; resolved_at: string | null };
type Candidate = { retrieval_run_id: string; span_id: string; document_title: string; version_label: string; evidence_class: string; disclosure_policy: string; text_content: string; page_number: number | null; sheet_name: string | null; cell_range: string | null; heading_path: string[]; scope_match: string; keyword_score: number; authority_score: number; freshness_score: number; final_rank: number; contradiction_count: number };

async function api<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

const emptyScope = {
  mode: 'selected', legalEntities: [], businessUnits: [], products: ['Core SaaS'], environments: ['production'], regions: ['global'], dataClasses: [], deploymentModels: [], customerSegments: [], productVersionExpression: null, effectiveFrom: null, effectiveUntil: null, customDimensions: {},
};

function locationLabel(item: Pick<Span, 'page_number' | 'sheet_name' | 'cell_range'>): string {
  if (item.sheet_name) return `${item.sheet_name}${item.cell_range ? ` · ${item.cell_range}` : ''}`;
  if (item.page_number) return `Page ${item.page_number}`;
  return 'Document text';
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(Number(value) * 100)}%`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [objects, setObjects] = useState<StoredObject[]>([]);
  const [documents, setDocuments] = useState<EvidenceDocument[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [detail, setDetail] = useState<{ version: Record<string, unknown>; spans: Span[]; warnings: Warning[]; extractionRuns: unknown[] } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState('How often are production access rights reviewed?');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ storedObjectId: '', title: '', sourceType: 'policy', evidenceClass: 'governance_evidence', confidentiality: 'internal', disclosurePolicy: 'internal_citation_only', versionLabel: 'v1', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveUntil: '', reviewDueAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), products: 'Core SaaS', environments: 'production', regions: 'global' });

  const role = useMemo(() => workspaces.find((workspace) => workspace.tenant_id === tenantId)?.role, [tenantId, workspaces]);
  const canManage = role === 'knowledge_owner';

  const loadWorkspace = useCallback(async () => {
    if (!session || !tenantId) return;
    const [objectResult, documentResult] = await Promise.all([
      api<{ objects: StoredObject[] }>(session, `/v1/workspaces/${tenantId}/accepted-objects`),
      api<{ documents: EvidenceDocument[] }>(session, `/v1/workspaces/${tenantId}/evidence-documents`),
    ]);
    setObjects(objectResult.objects);
    setDocuments(documentResult.documents);
  }, [session, tenantId]);

  const loadVersion = useCallback(async (versionId: string) => {
    if (!session || !tenantId || !versionId) return;
    const result = await api<{ version: Record<string, unknown>; spans: Span[]; warnings: Warning[]; extractionRuns: unknown[] }>(session, `/v1/workspaces/${tenantId}/evidence-versions/${versionId}`);
    setDetail(result);
  }, [session, tenantId]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void api<{ workspaces: Workspace[] }>(session, '/v1/workspaces')
      .then((result) => { setWorkspaces(result.workspaces); setTenantId((current) => current || result.workspaces[0]?.tenant_id || ''); })
      .catch((reason: Error) => setError(reason.message));
  }, [session]);

  useEffect(() => {
    if (!tenantId) return;
    void loadWorkspace().catch((reason: Error) => setError(reason.message));
    const timer = window.setInterval(() => {
      void loadWorkspace().catch(() => undefined);
      if (selectedVersionId) void loadVersion(selectedVersionId).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadVersion, loadWorkspace, selectedVersionId, tenantId]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (authError) setError(authError.message); else setNotice('Check your email for the secure sign-in link.');
  }

  async function createEvidence(event: FormEvent) {
    event.preventDefault(); if (!session || !tenantId) return;
    setBusy(true); setError('');
    try {
      const scope = { ...emptyScope, products: form.products.split(',').map((value) => value.trim()).filter(Boolean), environments: form.environments.split(',').map((value) => value.trim()).filter(Boolean), regions: form.regions.split(',').map((value) => value.trim()).filter(Boolean), effectiveFrom: form.effectiveFrom || null, effectiveUntil: form.effectiveUntil || null };
      const result = await api<{ evidence: { evidence_document_id: string; evidence_version_id: string } }>(session, `/v1/workspaces/${tenantId}/evidence-documents`, {
        method: 'POST', body: JSON.stringify({ storedObjectId: form.storedObjectId, title: form.title, sourceType: form.sourceType, evidenceClass: form.evidenceClass, confidentiality: form.confidentiality, disclosurePolicy: form.disclosurePolicy, versionLabel: form.versionLabel, scope, effectiveFrom: form.effectiveFrom || null, effectiveUntil: form.effectiveUntil || null, reviewDueAt: form.reviewDueAt || null }),
      });
      setSelectedVersionId(result.evidence.evidence_version_id);
      setNotice('Evidence version created. Start extraction after reviewing the metadata.');
      await loadWorkspace();
      await loadVersion(result.evidence.evidence_version_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Evidence creation failed.'); }
    finally { setBusy(false); }
  }

  async function startExtraction(versionId: string) {
    if (!session || !tenantId) return; setBusy(true); setError('');
    try {
      await api(session, `/v1/workspaces/${tenantId}/evidence-versions/${versionId}/extract`, { method: 'POST', body: '{}' });
      setNotice('Extraction queued. The source remains unapproved until review succeeds.');
      await loadWorkspace();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Extraction could not start.'); }
    finally { setBusy(false); }
  }

  async function approve(versionId: string) {
    if (!session || !tenantId) return; setBusy(true); setError('');
    try {
      await api(session, `/v1/workspaces/${tenantId}/evidence-versions/${versionId}/approve`, { method: 'POST', body: JSON.stringify({ rationale: 'Reviewed extraction, scope, provenance, confidentiality, and effective period.', restricted: false }) });
      setNotice('Evidence approved for retrieval within its recorded scope.');
      await loadWorkspace(); await loadVersion(versionId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Evidence approval failed.'); }
    finally { setBusy(false); }
  }

  async function search(event: FormEvent) {
    event.preventDefault(); if (!session || !tenantId) return; setBusy(true); setError('');
    try {
      const result = await api<{ candidates: Candidate[] }>(session, `/v1/workspaces/${tenantId}/evidence/search`, { method: 'POST', body: JSON.stringify({ query, requestedScope: emptyScope, operation: 'internal_answer_support', includeHistorical: false, limit: 10 }) });
      setCandidates(result.candidates);
      setNotice(result.candidates.length ? 'Only eligible, approved, in-scope evidence is shown.' : 'No eligible evidence matched. The system did not broaden scope or use unapproved material.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Search failed.'); }
    finally { setBusy(false); }
  }

  if (!session) return (
    <main className="auth-shell"><section className="auth-card"><span className="eyebrow">Evidence admission system</span><h1>Attestly Evidence</h1><p>Convert accepted files into scoped, approved, citable evidence. Extracted content remains untrusted until reviewed.</p><form onSubmit={signIn} className="stack"><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><button disabled={busy}>Send secure sign-in link</button></form>{notice && <p className="notice">{notice}</p>}{error && <p className="error">{error}</p>}</section></main>
  );

  return (
    <main className="shell">
      <header className="topbar"><div><span className="eyebrow">Phase 3 · evidence intelligence</span><h1>Evidence Console</h1></div><div className="actions"><select value={tenantId} onChange={(event) => setTenantId(event.target.value)}><option value="">Choose workspace</option>{workspaces.map((workspace) => <option key={workspace.tenant_id} value={workspace.tenant_id}>{workspace.organizations.name} · {workspace.role}</option>)}</select><button className="secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button></div></header>
      {(notice || error) && <div className={error ? 'banner error' : 'banner notice'}>{error || notice}<button className="dismiss" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
      {!canManage && <div className="banner warning">This workspace role can inspect evidence but cannot create, extract, or approve it. A knowledge owner role is required.</div>}

      <section className="layout">
        <aside className="panel creation"><span className="eyebrow">Admission</span><h2>Create evidence version</h2><form onSubmit={createEvidence} className="stack compact">
          <label>Accepted source object<select value={form.storedObjectId} onChange={(event) => setForm({ ...form, storedObjectId: event.target.value })} required><option value="">Select immutable file</option>{objects.map((object) => <option key={object.id} value={object.id}>{object.file_name}</option>)}</select></label>
          <label>Document title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
          <div className="two"><label>Source type<select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })}><option value="policy">Policy</option><option value="audit_report">Audit report</option><option value="operational_record">Operational record</option><option value="architecture">Architecture</option><option value="prior_questionnaire">Prior questionnaire</option></select></label><label>Version<input value={form.versionLabel} onChange={(event) => setForm({ ...form, versionLabel: event.target.value })} /></label></div>
          <label>Evidence class<select value={form.evidenceClass} onChange={(event) => setForm({ ...form, evidenceClass: event.target.value })}><option value="independent_attestation">Independent attestation</option><option value="operational_proof">Operational proof</option><option value="implementation_documentation">Implementation documentation</option><option value="governance_evidence">Governance evidence</option><option value="historical_representation">Historical representation</option><option value="unverified_statement">Unverified statement</option></select></label>
          <div className="two"><label>Confidentiality<select value={form.confidentiality} onChange={(event) => setForm({ ...form, confidentiality: event.target.value })}><option>public</option><option>internal</option><option>confidential</option><option>restricted</option></select></label><label>Disclosure<select value={form.disclosurePolicy} onChange={(event) => setForm({ ...form, disclosurePolicy: event.target.value })}><option value="external_quote_allowed">External quote</option><option value="external_summary_only">Summary only</option><option value="internal_citation_only">Internal only</option><option value="prohibited">Prohibited</option></select></label></div>
          <label>Products<input value={form.products} onChange={(event) => setForm({ ...form, products: event.target.value })} /></label><label>Environments<input value={form.environments} onChange={(event) => setForm({ ...form, environments: event.target.value })} /></label><label>Regions<input value={form.regions} onChange={(event) => setForm({ ...form, regions: event.target.value })} /></label>
          <div className="two"><label>Effective from<input type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} /></label><label>Review due<input type="date" value={form.reviewDueAt} onChange={(event) => setForm({ ...form, reviewDueAt: event.target.value })} /></label></div>
          <button disabled={busy || !canManage}>Create version</button>
        </form></aside>

        <section className="panel documents"><div className="heading"><div><span className="eyebrow">Corpus</span><h2>Evidence documents</h2></div><button className="secondary" onClick={() => void loadWorkspace()}>Refresh</button></div>
          <div className="cards">{documents.map((document) => <article className="document-card" key={document.id}><div className="document-title"><div><strong>{document.title}</strong><small>{document.evidence_class.replaceAll('_', ' ')} · {document.confidentiality}</small></div><span className={`pill ${document.lifecycle_status}`}>{document.lifecycle_status.replaceAll('_', ' ')}</span></div>{document.evidence_versions.map((version) => <button className={`version ${selectedVersionId === version.id ? 'selected' : ''}`} key={version.id} onClick={() => { setSelectedVersionId(version.id); void loadVersion(version.id); }}><span>{version.version_label}</span><span>{version.extraction_status.replaceAll('_', ' ')} · quality {formatPercent(version.extraction_quality)}</span><span>{version.index_status.replaceAll('_', ' ')}</span></button>)}</article>)}{documents.length === 0 && <p className="empty">No admitted evidence yet.</p>}</div>
        </section>
      </section>

      {selectedVersionId && <section className="review-grid">
        <article className="panel"><div className="heading"><div><span className="eyebrow">Review gate</span><h2>Extraction and approval</h2></div><div className="actions"><button disabled={busy || !canManage} onClick={() => void startExtraction(selectedVersionId)}>Run extraction</button><button disabled={busy || !canManage || !detail} onClick={() => void approve(selectedVersionId)}>Approve evidence</button></div></div>
          <div className="warning-list">{detail?.warnings.map((warning) => <div className={`warning-item ${warning.severity}`} key={warning.id}><strong>{warning.code.replaceAll('_', ' ')}</strong><span>{warning.message}</span><small>{warning.sheet_name ?? (warning.page_number ? `Page ${warning.page_number}` : 'Document')}</small></div>)}{detail && detail.warnings.length === 0 && <p className="notice">No extraction warnings.</p>}</div>
        </article>
        <article className="panel"><span className="eyebrow">Exact provenance</span><h2>Citable spans</h2><div className="span-list">{detail?.spans.map((span) => <article className="span" key={span.id}><div><strong>{span.heading_path.join(' › ') || 'Untitled section'}</strong><small>{locationLabel(span)} · {span.extraction_method.replaceAll('_', ' ')} · {formatPercent(span.extraction_confidence)}</small></div><p>{span.text_content}</p></article>)}{detail && detail.spans.length === 0 && <p className="empty">No citable spans yet.</p>}</div></article>
      </section>}

      <section className="panel search-lab"><div className="heading"><div><span className="eyebrow">Eligibility before ranking</span><h2>Retrieval laboratory</h2></div></div><form onSubmit={search} className="search-form"><input value={query} onChange={(event) => setQuery(event.target.value)} /><button disabled={busy || !tenantId}>Search approved evidence</button></form><div className="candidate-list">{candidates.map((candidate) => <article className="candidate" key={candidate.span_id}><div className="candidate-head"><div><strong>{candidate.document_title} · {candidate.version_label}</strong><small>{candidate.heading_path.join(' › ') || locationLabel({ page_number: candidate.page_number, sheet_name: candidate.sheet_name, cell_range: candidate.cell_range })}</small></div><span className={`pill ${candidate.scope_match}`}>{candidate.scope_match}</span></div><p>{candidate.text_content}</p><footer><span>Rank {formatPercent(candidate.final_rank)}</span><span>Authority {formatPercent(candidate.authority_score)}</span><span>Freshness {formatPercent(candidate.freshness_score)}</span><span>{candidate.contradiction_count ? `${candidate.contradiction_count} contradiction relation(s)` : 'No recorded contradiction'}</span></footer></article>)}{candidates.length === 0 && <p className="empty">Run a query to inspect eligible retrieval candidates.</p>}</div></section>
    </main>
  );
}
