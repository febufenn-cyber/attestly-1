import { createClient, type Session } from '@supabase/supabase-js';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const apiUrl = import.meta.env.VITE_QUESTIONNAIRE_API_URL as string | undefined;
if (!supabaseUrl || !supabaseAnonKey || !apiUrl) throw new Error('Questionnaire console environment is incomplete.');
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

type Workspace = { tenant_id: string; role: string; organizations: { id: string; name: string; slug: string } };
type StoredObject = { id: string; file_name: string; declared_mime_type: string; detected_mime_type: string | null; size_bytes: number; sha256: string; malware_scan_status: string };
type MappingSummary = { id: string; version_number: number; status: string; compatibility_status: string; target_scope: Record<string, unknown>; created_at: string; frozen_at: string | null };
type SnapshotSummary = { id: string; snapshot_hash: string; status: string; question_count: number; atomic_request_count: number; frozen_at: string };
type Questionnaire = { id: string; stored_object_id: string; source_sha256: string; format: string; original_filename: string; lifecycle_status: string; questionnaire_import_runs: Array<{ id: string; status: string; compatibility_status: string | null; statistics: Record<string, number>; created_at: string }>; questionnaire_mapping_versions: MappingSummary[]; questionnaire_snapshots: SnapshotSummary[] };
type QuestionRow = { id: string; local_id: string; external_identifier: string | null; original_text: string; normalized_text: string; question_type: string; polarity: string; display_order: number; source_location: Record<string, unknown>; answer_format: Record<string, unknown>; inclusion_status: string; mapping_confidence: Record<string, number>; parser_notes: string[]; parent_local_id: string | null };
type DestinationRow = { id: string; local_id: string; question_local_id: string | null; destination_type: string; source_location: Record<string, unknown>; expected_value_type: string; allowed_values: string[]; stored_values: Record<string, string>; formula_present: boolean; protected: boolean; style_hash: string | null; validation_hash: string | null; write_strategy: string };
type ConditionRow = { id: string; local_id: string; child_question_local_id: string; original_instruction: string; expression: Record<string, unknown>; parser_confidence: number; human_confirmed: boolean };
type InstructionRow = { id: string; local_id: string; instruction_scope: string; category: string; instruction_text: string; source_location: Record<string, unknown> };
type WarningRow = { id: string; code: string; severity: string; message: string; recommended_action: string; export_blocking: boolean; resolved_at: string | null; source_location: Record<string, unknown> | null };
type MappingDetail = { mapping: Record<string, unknown>; questions: QuestionRow[]; destinations: DestinationRow[]; conditions: ConditionRow[]; instructions: InstructionRow[]; warnings: WarningRow[] };

async function api<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sourceLocationLabel(location: Record<string, unknown>): string {
  const sheet = typeof location.sheetName === 'string' ? location.sheetName : '';
  const cell = typeof location.cellRange === 'string' ? location.cellRange : '';
  const row = typeof location.rowIndex === 'number' ? `Row ${location.rowIndex}` : '';
  const paragraph = typeof location.paragraphId === 'string' ? location.paragraphId : '';
  return [sheet, cell, row, paragraph].filter(Boolean).join(' · ') || 'Mapped source region';
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function inferFormat(object: StoredObject): 'xlsx' | 'csv' | 'docx' | 'pdf' {
  const name = object.file_name.toLowerCase();
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.docx')) return 'docx';
  return 'pdf';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [objects, setObjects] = useState<StoredObject[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [selectedMappingId, setSelectedMappingId] = useState('');
  const [detail, setDetail] = useState<MappingDetail | null>(null);
  const [products, setProducts] = useState('Core SaaS');
  const [environments, setEnvironments] = useState('production');
  const [regions, setRegions] = useState('global');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [testAnswers, setTestAnswers] = useState<Record<string, unknown>>({});
  const [exportPreview, setExportPreview] = useState<{ exportPlanId: string; operations: unknown[]; blockingErrors: string[] } | null>(null);

  const role = useMemo(() => workspaces.find((workspace) => workspace.tenant_id === tenantId)?.role, [tenantId, workspaces]);
  const canReview = ['knowledge_owner', 'security_reviewer', 'legal_reviewer', 'final_approver'].includes(role ?? '');
  const canApprove = role === 'final_approver';

  const loadWorkspace = useCallback(async () => {
    if (!session || !tenantId) return;
    const [objectResult, questionnaireResult] = await Promise.all([
      api<{ objects: StoredObject[] }>(session, `/v1/workspaces/${tenantId}/accepted-objects`),
      api<{ questionnaires: Questionnaire[] }>(session, `/v1/workspaces/${tenantId}/questionnaires`),
    ]);
    setObjects(objectResult.objects.filter((object) => /\.(xlsx|csv|docx|pdf)$/i.test(object.file_name)));
    setQuestionnaires(questionnaireResult.questionnaires);
  }, [session, tenantId]);

  const loadMapping = useCallback(async (mappingId: string) => {
    if (!session || !tenantId || !mappingId) return;
    const result = await api<MappingDetail>(session, `/v1/workspaces/${tenantId}/mappings/${mappingId}`);
    setDetail(result);
    const scope = result.mapping.target_scope as { products?: string[]; environments?: string[]; regions?: string[] } | undefined;
    setProducts(scope?.products?.join(', ') || 'Core SaaS');
    setEnvironments(scope?.environments?.join(', ') || 'production');
    setRegions(scope?.regions?.join(', ') || 'global');
    const answers: Record<string, unknown> = {};
    for (const question of result.questions) {
      const format = question.answer_format as { valueType?: string; allowedValues?: string[] };
      if (format.allowedValues?.length) answers[question.local_id] = format.allowedValues[0];
      else if (format.valueType === 'boolean') answers[question.local_id] = true;
      else if (format.valueType === 'number' || format.valueType === 'percentage') answers[question.local_id] = 1;
      else if (format.valueType === 'date') answers[question.local_id] = new Date().toISOString().slice(0, 10);
      else answers[question.local_id] = 'TEST PLACEHOLDER — NOT AN APPROVED CUSTOMER ANSWER';
    }
    setTestAnswers(answers);
    setExportPreview(null);
  }, [session, tenantId]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void api<{ workspaces: Workspace[] }>(session, '/v1/workspaces')
      .then(({ workspaces: values }) => {
        setWorkspaces(values);
        setTenantId((current) => current || values[0]?.tenant_id || '');
      })
      .catch((reason: Error) => setError(reason.message));
  }, [session]);

  useEffect(() => {
    void loadWorkspace().catch((reason: Error) => setError(reason.message));
  }, [loadWorkspace]);

  useEffect(() => {
    if (!selectedMappingId) return;
    void loadMapping(selectedMappingId).catch((reason: Error) => setError(reason.message));
  }, [loadMapping, selectedMappingId]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (authError) setError(authError.message);
    else setNotice('Check your email for the secure sign-in link.');
  }

  async function createAndImport() {
    if (!session || !tenantId || !selectedObjectId) return;
    setBusy(true);
    setError('');
    try {
      const object = objects.find((candidate) => candidate.id === selectedObjectId);
      if (!object) throw new Error('Select an accepted questionnaire file.');
      const created = await api<{ questionnaireArtifactId: string }>(session, `/v1/workspaces/${tenantId}/questionnaires`, {
        method: 'POST',
        body: JSON.stringify({ storedObjectId: object.id, format: inferFormat(object) }),
      });
      await api(session, `/v1/workspaces/${tenantId}/questionnaires/${created.questionnaireArtifactId}/imports`, { method: 'POST', body: '{}' });
      setNotice('Questionnaire admitted. Compatibility inspection is running asynchronously.');
      window.setTimeout(() => void loadWorkspace(), 3000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Questionnaire admission failed.');
    } finally {
      setBusy(false);
    }
  }

  async function createConfirmedRevision() {
    if (!session || !tenantId || !selectedMappingId || !detail) return;
    setBusy(true);
    setError('');
    try {
      const destinations = detail.destinations.map((destination) => ({
        localId: destination.local_id,
        questionLocalId: destination.question_local_id ?? undefined,
        type: destination.destination_type,
        location: destination.source_location,
        expectedValueType: destination.expected_value_type,
        allowedValues: destination.allowed_values ?? [],
        storedValues: destination.stored_values ?? {},
        formulaPresent: destination.formula_present,
        protected: destination.protected,
        styleHash: destination.style_hash ?? undefined,
        validationHash: destination.validation_hash ?? undefined,
        writeStrategy: destination.write_strategy,
      }));
      const questions = detail.questions.map((question) => ({
        localId: question.local_id,
        externalIdentifier: question.external_identifier ?? undefined,
        originalText: question.original_text,
        normalizedText: question.normalized_text,
        type: question.question_type,
        polarity: question.polarity,
        displayOrder: question.display_order,
        sectionPath: (question.source_location.sectionPath as string[] | undefined) ?? [],
        sourceLocation: question.source_location,
        answerFormat: question.answer_format,
        answerDestinationLocalIds: destinations.filter((destination) => destination.questionLocalId === question.local_id || !destination.questionLocalId).map((destination) => destination.localId),
        atomicRequests: [],
        parentLocalId: question.parent_local_id ?? undefined,
        inclusionStatus: question.inclusion_status === 'excluded' ? 'excluded' : 'included',
        confidence: question.mapping_confidence,
        parserNotes: question.parser_notes ?? [],
      }));
      const conditions = detail.conditions.map((condition) => ({
        localId: condition.local_id,
        childQuestionLocalId: condition.child_question_local_id,
        originalInstruction: condition.original_instruction,
        expression: condition.expression,
        parserConfidence: Number(condition.parser_confidence),
        humanConfirmed: true,
      }));
      const result = await api<{ mappingVersionId: string }>(session, `/v1/workspaces/${tenantId}/mappings/${selectedMappingId}/revisions`, {
        method: 'POST',
        body: JSON.stringify({
          targetScope: {
            mode: 'selected',
            products: products.split(',').map((value) => value.trim()).filter(Boolean),
            environments: environments.split(',').map((value) => value.trim()).filter(Boolean),
            regions: regions.split(',').map((value) => value.trim()).filter(Boolean),
            deploymentModels: [],
            customDimensions: {},
          },
          notes: 'Human-confirmed mapping revision from the Phase 4 reviewer console.',
          mapping: {
            questions,
            destinations,
            conditions,
            instructions: detail.instructions.map((instruction) => ({
              localId: instruction.local_id,
              scope: instruction.instruction_scope,
              category: instruction.category,
              text: instruction.instruction_text,
              sourceLocation: instruction.source_location,
            })),
          },
        }),
      });
      setSelectedMappingId(result.mappingVersionId);
      setNotice('A new immutable mapping revision was created.');
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mapping revision failed.');
    } finally {
      setBusy(false);
    }
  }

  async function resolveWarning(warningId: string) {
    if (!session || !tenantId) return;
    try {
      await api(session, `/v1/workspaces/${tenantId}/warnings/${warningId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution: 'Reviewed and resolved by an authorized questionnaire reviewer.' }),
      });
      await loadMapping(selectedMappingId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Warning resolution failed.');
    }
  }

  async function freezeSnapshot() {
    if (!session || !tenantId || !selectedMappingId || !detail) return;
    setBusy(true);
    setError('');
    try {
      const targetScope = {
        mode: 'selected' as const,
        products: products.split(',').map((value) => value.trim()).filter(Boolean),
        environments: environments.split(',').map((value) => value.trim()).filter(Boolean),
        regions: regions.split(',').map((value) => value.trim()).filter(Boolean),
        deploymentModels: [],
        customDimensions: {},
      };
      const snapshotHash = await sha256({
        mappingId: selectedMappingId,
        sourceSha256: detail.mapping.source_sha256,
        processorVersion: detail.mapping.processor_version,
        targetScope,
        questions: detail.questions,
        destinations: detail.destinations,
        conditions: detail.conditions,
      });
      const result = await api<{ questionnaireSnapshotId: string }>(session, `/v1/workspaces/${tenantId}/mappings/${selectedMappingId}/freeze`, {
        method: 'POST',
        body: JSON.stringify({ snapshotHash, targetScope }),
      });
      setNotice(`Frozen snapshot created: ${result.questionnaireSnapshotId}`);
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Snapshot freeze failed.');
    } finally {
      setBusy(false);
    }
  }

  async function compileTestPlan(snapshotId: string) {
    if (!session || !tenantId) return;
    setBusy(true);
    setError('');
    try {
      const answerSnapshotHash = await sha256(testAnswers);
      const result = await api<{ exportPlanId: string; operations: unknown[]; blockingErrors: string[] }>(
        session,
        `/v1/workspaces/${tenantId}/snapshots/${snapshotId}/export-plans`,
        { method: 'POST', body: JSON.stringify({ answerSnapshotHash, answers: testAnswers }) },
      );
      setExportPreview(result);
      setNotice('Test-only export plan compiled. No customer answer was generated by AI.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Export plan compilation failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="eyebrow">Questionnaire intelligence</span>
          <h1>Attestly</h1>
          <p>Map buyer questionnaires, preserve their structure, and prove every export destination before answer generation begins.</p>
          <form onSubmit={signIn} className="stack">
            <label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <button disabled={busy}>{busy ? 'Sending…' : 'Send secure sign-in link'}</button>
          </form>
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  const selectedMapping = questionnaires.flatMap((questionnaire) => questionnaire.questionnaire_mapping_versions).find((mapping) => mapping.id === selectedMappingId);
  const snapshotForMapping = questionnaires.flatMap((questionnaire) => questionnaire.questionnaire_snapshots).find((snapshot) =>
    questionnaires.some((questionnaire) => questionnaire.questionnaire_mapping_versions.some((mapping) => mapping.id === selectedMappingId) && questionnaire.questionnaire_snapshots.some((candidate) => candidate.id === snapshot.id)),
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="eyebrow">Phase 4 · reversible transformation</span><h1>Questionnaire Intelligence</h1></div>
        <div className="topbar-actions">
          <select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setSelectedMappingId(''); setDetail(null); }}>
            <option value="">Select workspace</option>
            {workspaces.map((workspace) => <option key={workspace.tenant_id} value={workspace.tenant_id}>{workspace.organizations.name} · {workspace.role}</option>)}
          </select>
          <button className="secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {(notice || error) && <div className={error ? 'banner error' : 'banner notice'}>{error || notice}<button className="dismiss" onClick={() => { setError(''); setNotice(''); }}>×</button></div>}

      <section className="grid three">
        <article className="panel">
          <span className="eyebrow">1 · Immutable source</span>
          <h2>Admit questionnaire</h2>
          <select value={selectedObjectId} onChange={(event) => setSelectedObjectId(event.target.value)}>
            <option value="">Choose accepted file</option>
            {objects.map((object) => <option key={object.id} value={object.id}>{object.file_name} · {formatBytes(object.size_bytes)}</option>)}
          </select>
          <button disabled={!selectedObjectId || busy} onClick={() => void createAndImport()}>Create artifact and inspect</button>
          <small>The immutable original is never overwritten.</small>
        </article>
        <article className="panel">
          <span className="eyebrow">2 · Scope</span>
          <h2>Questionnaire context</h2>
          <label>Products<input value={products} onChange={(event) => setProducts(event.target.value)} /></label>
          <label>Environments<input value={environments} onChange={(event) => setEnvironments(event.target.value)} /></label>
          <label>Regions<input value={regions} onChange={(event) => setRegions(event.target.value)} /></label>
        </article>
        <article className="panel">
          <span className="eyebrow">3 · Freeze</span>
          <h2>Immutable snapshot</h2>
          <p>Freezing binds source hash, mappings, conditions, destinations, scope and ordering into one downstream contract.</p>
          <button disabled={!canApprove || !selectedMappingId || selectedMapping?.status !== 'draft' || busy} onClick={() => void freezeSnapshot()}>Freeze reviewed mapping</button>
          {!canApprove && <small>Final approver role required.</small>}
        </article>
      </section>

      <section className="panel wide">
        <div className="section-heading"><div><span className="eyebrow">Imported artifacts</span><h2>Questionnaire inventory</h2></div><button className="secondary" onClick={() => void loadWorkspace()}>Refresh</button></div>
        <div className="cards">
          {questionnaires.map((questionnaire) => (
            <article className="artifact-card" key={questionnaire.id}>
              <strong>{questionnaire.original_filename}</strong>
              <span>{questionnaire.format.toUpperCase()} · {questionnaire.questionnaire_import_runs.at(-1)?.compatibility_status ?? questionnaire.questionnaire_import_runs.at(-1)?.status ?? 'awaiting import'}</span>
              <div className="chips">
                {questionnaire.questionnaire_mapping_versions.sort((a, b) => b.version_number - a.version_number).map((mapping) => (
                  <button className={selectedMappingId === mapping.id ? 'chip active' : 'chip'} key={mapping.id} onClick={() => setSelectedMappingId(mapping.id)}>Mapping v{mapping.version_number} · {mapping.status}</button>
                ))}
              </div>
              {questionnaire.questionnaire_snapshots.map((snapshot) => (
                <button className="secondary" key={snapshot.id} onClick={() => void compileTestPlan(snapshot.id)}>Compile test plan for {snapshot.question_count} questions</button>
              ))}
            </article>
          ))}
          {!questionnaires.length && <p className="empty">No questionnaire artifacts yet.</p>}
        </div>
      </section>

      {detail && (
        <>
          <section className="split">
            <article className="panel">
              <div className="section-heading"><div><span className="eyebrow">Compatibility and warnings</span><h2>Review blockers</h2></div><span className="status">{String(detail.mapping.compatibility_status)}</span></div>
              <ul className="warnings">
                {detail.warnings.map((warning) => (
                  <li key={warning.id} className={warning.export_blocking && !warning.resolved_at ? 'warning blocking' : 'warning'}>
                    <strong>{warning.code.replaceAll('_', ' ')}</strong>
                    <span>{warning.message}</span>
                    <small>{warning.recommended_action}</small>
                    {!warning.resolved_at && canReview && <button className="secondary" onClick={() => void resolveWarning(warning.id)}>Mark reviewed</button>}
                    {warning.resolved_at && <em>Resolved</em>}
                  </li>
                ))}
                {!detail.warnings.length && <li className="empty">No import warnings.</li>}
              </ul>
            </article>
            <article className="panel">
              <span className="eyebrow">Mapping version</span>
              <h2>Human confirmation</h2>
              <p>Corrections create a new mapping version. Historical mappings remain available for audit and existing downstream work.</p>
              <button disabled={!canReview || busy} onClick={() => void createConfirmedRevision()}>Create confirmed revision</button>
              <dl className="summary-list">
                <div><dt>Questions</dt><dd>{detail.questions.length}</dd></div>
                <div><dt>Destinations</dt><dd>{detail.destinations.length}</dd></div>
                <div><dt>Conditions</dt><dd>{detail.conditions.length}</dd></div>
                <div><dt>Instructions</dt><dd>{detail.instructions.length}</dd></div>
              </dl>
            </article>
          </section>

          <section className="panel wide">
            <span className="eyebrow">Detected structure</span>
            <h2>Questions and destinations</h2>
            <div className="question-list">
              {detail.questions.map((question) => {
                const destinations = detail.destinations.filter((destination) => destination.question_local_id === question.local_id || !destination.question_local_id);
                return (
                  <article className="question-card" key={question.id}>
                    <header><span>#{question.display_order}</span><strong>{question.external_identifier || question.question_type}</strong><span className={`polarity ${question.polarity}`}>{question.polarity}</span></header>
                    <p>{question.original_text}</p>
                    <small>{sourceLocationLabel(question.source_location)}</small>
                    <div className="destination-list">
                      {destinations.map((destination) => <span key={destination.id} className={destination.formula_present || destination.protected ? 'destination unsafe' : 'destination'}>{sourceLocationLabel(destination.source_location)} · {destination.destination_type}{destination.formula_present ? ' · formula' : ''}{destination.protected ? ' · protected' : ''}</span>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {exportPreview && (
        <section className="panel wide">
          <span className="eyebrow">Test-only plan</span>
          <h2>Deterministic export preview</h2>
          <p>This preview uses synthetic placeholders to validate destination and condition handling. It is not a completed customer questionnaire.</p>
          <dl className="summary-list"><div><dt>Operations</dt><dd>{exportPreview.operations.length}</dd></div><div><dt>Blockers</dt><dd>{exportPreview.blockingErrors.length}</dd></div></dl>
          {exportPreview.blockingErrors.map((blocker) => <p className="error" key={blocker}>{blocker}</p>)}
        </section>
      )}
    </main>
  );
}
