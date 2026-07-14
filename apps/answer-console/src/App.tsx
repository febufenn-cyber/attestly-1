import { createClient, type Session } from '@supabase/supabase-js';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const apiUrl = import.meta.env.VITE_ANSWER_API_URL as string | undefined;
if (!supabaseUrl || !supabaseAnonKey || !apiUrl) {
  throw new Error('Answer console environment is incomplete.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

type Workspace = {
  tenant_id: string;
  role: string;
  organizations: { id: string; name: string; slug: string };
};

type Snapshot = {
  id: string;
  snapshot_hash: string;
  status: string;
  target_scope: Record<string, unknown>;
  question_count: number;
  atomic_request_count: number;
  frozen_at: string;
};

type Question = {
  id: string;
  local_id: string;
  original_text: string;
  normalized_text: string;
  question_type: string;
  polarity: string;
  display_order: number;
  answer_format: Record<string, unknown>;
  source_location: Record<string, unknown>;
};

type Generation = {
  id: string;
  questionnaire_snapshot_id: string;
  question_id: string;
  operation: string;
  status: string;
  provider: string;
  model: string;
  model_version: string | null;
  prompt_version: string;
  failure_code: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
};

type Citation = {
  id: string;
  evidence_span_id: string;
  evidence_version_id: string;
  citation_role: string;
  quote_text: string;
};

type Claim = {
  id: string;
  claim_local_id: string;
  original_clause: string;
  normalized_claim: string;
  qualifiers: string[];
  materiality: string;
  disposition: string;
  proposed_statement: string;
  reasons: string[];
  missing_information: string[];
  answer_citations: Citation[];
};

type Revision = {
  id: string;
  revision_number: number;
  state: string;
  outward_value: string | null;
  outward_text: string;
  confidence: Record<string, number>;
  risk_tier: string;
  required_reviewers: string[];
  limitations: string[];
  contradictions: string[];
  missing_information: string[];
  provider: string;
  model: string;
  model_version: string | null;
  prompt_version: string;
  schema_version: number;
  deterministic_validation: {
    passed?: boolean;
    errors?: string[];
    warnings?: string[];
  };
  generated_at: string;
  answer_claims: Claim[];
};

type Candidate = {
  id: string;
  evidence_span_id: string;
  evidence_version_id: string;
  candidate_order: number;
  candidate_snapshot: {
    documentTitle?: string;
    versionLabel?: string;
    pageNumber?: number | null;
    sheetName?: string | null;
    cellRange?: string | null;
    headingPath?: string[];
    evidenceClass?: string;
    disclosurePolicy?: string;
    scopeMatch?: string;
    historical?: boolean;
    contradiction?: boolean;
    contradictionSummary?: string | null;
    retrievalScore?: number;
    text?: string;
  };
};

type Usage = {
  id: string;
  provider: string;
  model: string;
  provider_request_id: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  cost_micro_usd: number;
  attempt: number;
  created_at: string;
};

type GenerationDetail = {
  run: Generation & {
    requested_scope: Record<string, unknown>;
    input_hash: string | null;
    input_snapshot: Record<string, unknown> | null;
    questionnaire_questions: Question;
  };
  candidates: Candidate[];
  revisions: Revision[];
  usage: Usage[];
};

async function api<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(
      (body as { error?: { message?: string } } | null)?.error?.message ??
        `Request failed (${response.status})`,
    );
  }
  return body as T;
}

function locationLabel(location: Record<string, unknown>): string {
  return [
    typeof location.sheetName === 'string' ? location.sheetName : '',
    typeof location.cellRange === 'string' ? location.cellRange : '',
    typeof location.pageNumber === 'number' ? `Page ${location.pageNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function candidateLocation(candidate: Candidate | undefined): string {
  if (!candidate) return 'Exact source location unavailable';
  const snapshot = candidate.candidate_snapshot;
  return [
    snapshot.documentTitle,
    snapshot.versionLabel,
    snapshot.pageNumber ? `Page ${snapshot.pageNumber}` : '',
    snapshot.sheetName,
    snapshot.cellRange,
    snapshot.headingPath?.join(' › '),
  ]
    .filter(Boolean)
    .join(' · ');
}

function latestRevision(detail: GenerationDetail | null): Revision | null {
  return detail?.revisions.at(-1) ?? null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const role = useMemo(
    () => workspaces.find((workspace) => workspace.tenant_id === tenantId)?.role,
    [tenantId, workspaces],
  );
  const latestByQuestion = useMemo(() => {
    const values = new Map<string, Generation>();
    for (const generation of generations) {
      if (!values.has(generation.question_id)) values.set(generation.question_id, generation);
    }
    return values;
  }, [generations]);
  const revision = latestRevision(detail);
  const candidateBySpan = useMemo(
    () => new Map((detail?.candidates ?? []).map((candidate) => [candidate.evidence_span_id, candidate])),
    [detail],
  );

  const loadWorkspaces = useCallback(async () => {
    if (!session) return;
    const result = await api<{ workspaces: Workspace[] }>(session, '/v1/workspaces');
    setWorkspaces(result.workspaces);
    setTenantId((current) => current || result.workspaces[0]?.tenant_id || '');
  }, [session]);

  const loadSnapshots = useCallback(async () => {
    if (!session || !tenantId) return;
    const result = await api<{ snapshots: Snapshot[] }>(
      session,
      `/v1/workspaces/${tenantId}/snapshots`,
    );
    setSnapshots(result.snapshots);
    setSnapshotId((current) =>
      result.snapshots.some((snapshot) => snapshot.id === current)
        ? current
        : result.snapshots[0]?.id || '',
    );
  }, [session, tenantId]);

  const loadSnapshot = useCallback(async () => {
    if (!session || !tenantId || !snapshotId) return;
    const [questionResult, generationResult] = await Promise.all([
      api<{ questions: Question[] }>(
        session,
        `/v1/workspaces/${tenantId}/snapshots/${snapshotId}/questions`,
      ),
      api<{ generations: Generation[] }>(
        session,
        `/v1/workspaces/${tenantId}/generations?snapshotId=${snapshotId}`,
      ),
    ]);
    setQuestions(questionResult.questions);
    setGenerations(generationResult.generations);
    setSelectedQuestionId((current) => current || questionResult.questions[0]?.id || '');
  }, [session, tenantId, snapshotId]);

  const loadDetail = useCallback(async () => {
    if (!session || !tenantId || !selectedRunId) {
      setDetail(null);
      return;
    }
    const result = await api<GenerationDetail>(
      session,
      `/v1/workspaces/${tenantId}/generations/${selectedRunId}`,
    );
    setDetail(result);
  }, [session, tenantId, selectedRunId]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void loadWorkspaces().catch((reason: Error) => setError(reason.message));
  }, [loadWorkspaces]);

  useEffect(() => {
    setSnapshotId('');
    setSelectedQuestionId('');
    setSelectedRunId('');
    setDetail(null);
    void loadSnapshots().catch((reason: Error) => setError(reason.message));
  }, [loadSnapshots]);

  useEffect(() => {
    setSelectedQuestionId('');
    setSelectedRunId('');
    setDetail(null);
    void loadSnapshot().catch((reason: Error) => setError(reason.message));
  }, [loadSnapshot]);

  useEffect(() => {
    const latest = latestByQuestion.get(selectedQuestionId);
    setSelectedRunId(latest?.id ?? '');
  }, [latestByQuestion, selectedQuestionId]);

  useEffect(() => {
    void loadDetail().catch((reason: Error) => setError(reason.message));
  }, [loadDetail]);

  useEffect(() => {
    if (!session || !tenantId || !snapshotId) return;
    const timer = window.setInterval(() => {
      void loadSnapshot().catch(() => undefined);
      if (selectedRunId) void loadDetail().catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [session, tenantId, snapshotId, selectedRunId, loadSnapshot, loadDetail]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (authError) setError(authError.message);
    else setNotice('Check your email for the secure sign-in link.');
  }

  async function generate(questionId: string) {
    if (!session || !tenantId || !snapshotId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ generationRunId: string }>(
        session,
        `/v1/workspaces/${tenantId}/snapshots/${snapshotId}/questions/${questionId}/generations`,
        { method: 'POST', body: JSON.stringify({ operation: 'internal_answer_draft' }) },
      );
      setSelectedQuestionId(questionId);
      setSelectedRunId(result.generationRunId);
      setNotice('A new immutable generation run was queued.');
      await loadSnapshot();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Generation request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function generateUnresolved() {
    if (!session || !tenantId || !snapshotId) return;
    const unresolved = questions.filter((question) => {
      const latest = latestByQuestion.get(question.id);
      return !latest || ['failed_retryable', 'failed_terminal', 'cancelled'].includes(latest.status);
    });
    if (unresolved.length === 0) {
      setNotice('Every question already has an active or completed generation run.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const results = await Promise.allSettled(
        unresolved.map((question) =>
          api(
            session,
            `/v1/workspaces/${tenantId}/snapshots/${snapshotId}/questions/${question.id}/generations`,
            { method: 'POST', body: JSON.stringify({ operation: 'internal_answer_draft' }) },
          ),
        ),
      );
      const failures = results.filter((result) => result.status === 'rejected').length;
      setNotice(
        `${results.length - failures} immutable generation runs queued${failures ? `; ${failures} failed` : ''}.`,
      );
      await loadSnapshot();
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <form className="auth-card stack" onSubmit={signIn}>
          <span className="eyebrow">Attestly Phase 5</span>
          <h1>Answer inspection</h1>
          <p>
            Sign in to generate and inspect evidence-grounded drafts. This workspace cannot
            approve or export customer answers.
          </p>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button disabled={busy}>{busy ? 'Sending…' : 'Send secure link'}</button>
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Evidence-grounded answer engine</span>
          <h1>Draft inspection</h1>
          <p className="subtitle">Generated drafts are unapproved and cannot enter exports.</p>
        </div>
        <div className="topbar-actions">
          <label>
            Workspace
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.tenant_id} value={workspace.tenant_id}>
                  {workspace.organizations.name} · {workspace.role}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {notice && <div className="banner notice">{notice}</div>}
      {error && <div className="banner error">{error}</div>}

      <section className="toolbar panel">
        <label>
          Frozen questionnaire snapshot
          <select value={snapshotId} onChange={(event) => setSnapshotId(event.target.value)}>
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.question_count} questions · {snapshot.status} ·{' '}
                {snapshot.snapshot_hash.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || !snapshotId} onClick={() => void generateUnresolved()}>
          Generate unresolved
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void loadSnapshot()}
        >
          Refresh
        </button>
      </section>

      <div className="workspace-grid">
        <section className="panel question-panel">
          <div className="section-heading">
            <h2>Questions</h2>
            <span className="count">{questions.length}</span>
          </div>
          <div className="question-list">
            {questions.map((question) => {
              const latest = latestByQuestion.get(question.id);
              return (
                <button
                  key={question.id}
                  className={`question-card ${selectedQuestionId === question.id ? 'selected' : ''}`}
                  onClick={() => setSelectedQuestionId(question.id)}
                >
                  <span className="question-order">{question.display_order}</span>
                  <span className="question-copy">
                    <strong>{question.original_text}</strong>
                    <small>{locationLabel(question.source_location)}</small>
                  </span>
                  <span className={`status status-${latest?.status ?? 'not_started'}`}>
                    {latest?.status ?? 'not started'}
                  </span>
                </button>
              );
            })}
            {questions.length === 0 && <p className="empty">Select a frozen snapshot.</p>}
          </div>
        </section>

        <section className="panel run-panel">
          <div className="section-heading">
            <h2>Immutable runs</h2>
            <button
              disabled={busy || !selectedQuestionId}
              onClick={() => void generate(selectedQuestionId)}
            >
              {latestByQuestion.has(selectedQuestionId) ? 'Regenerate' : 'Generate'}
            </button>
          </div>
          <div className="run-list">
            {generations
              .filter((generation) => generation.question_id === selectedQuestionId)
              .map((generation) => (
                <button
                  key={generation.id}
                  className={`run-card ${selectedRunId === generation.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRunId(generation.id)}
                >
                  <span className={`status status-${generation.status}`}>
                    {generation.status}
                  </span>
                  <strong>{generation.provider} · {generation.model}</strong>
                  <small>{new Date(generation.created_at).toLocaleString()}</small>
                  {generation.failure_code && <small>{generation.failure_code}</small>}
                </button>
              ))}
            {!latestByQuestion.has(selectedQuestionId) && (
              <p className="empty">No generation run exists for this question.</p>
            )}
          </div>
        </section>

        <section className="panel detail-panel">
          {!detail ? (
            <p className="empty">Select or generate a run to inspect its provenance.</p>
          ) : (
            <div className="stack">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Canonical state</span>
                  <h2>{revision?.state ?? detail.run.status}</h2>
                </div>
                <span className={`status status-${revision?.state ?? detail.run.status}`}>
                  {revision ? `revision ${revision.revision_number}` : detail.run.status}
                </span>
              </div>

              <article className="subpanel">
                <h3>Customer question</h3>
                <p>{detail.run.questionnaire_questions.original_text}</p>
                <dl className="meta-grid">
                  <div><dt>Type</dt><dd>{detail.run.questionnaire_questions.question_type}</dd></div>
                  <div><dt>Polarity</dt><dd>{detail.run.questionnaire_questions.polarity}</dd></div>
                  <div><dt>Source</dt><dd>{locationLabel(detail.run.questionnaire_questions.source_location)}</dd></div>
                  <div><dt>Scope</dt><dd><code>{JSON.stringify(detail.run.requested_scope)}</code></dd></div>
                </dl>
              </article>

              <article className="subpanel outward">
                <h3>Unapproved outward draft</h3>
                <p className="outward-value">{revision?.outward_value ?? 'No outward value'}</p>
                <p>{revision?.outward_text || 'The engine abstained or the run has not completed.'}</p>
                <p className="warning-copy">This draft is not approved and cannot be exported.</p>
              </article>

              {revision && (
                <>
                  <article className="subpanel">
                    <h3>Atomic claims and exact citations</h3>
                    <div className="claim-list">
                      {revision.answer_claims.map((claim) => (
                        <div key={claim.id} className="claim-card">
                          <div className="section-heading">
                            <strong>{claim.normalized_claim}</strong>
                            <span className={`status status-${claim.disposition}`}>
                              {claim.disposition}
                            </span>
                          </div>
                          {claim.qualifiers.length > 0 && (
                            <p><strong>Qualifiers:</strong> {claim.qualifiers.join(', ')}</p>
                          )}
                          {claim.proposed_statement && <p>{claim.proposed_statement}</p>}
                          {claim.reasons.length > 0 && (
                            <ul>{claim.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                          )}
                          {claim.missing_information.length > 0 && (
                            <div className="missing">
                              <strong>Missing information</strong>
                              <ul>{claim.missing_information.map((item) => <li key={item}>{item}</li>)}</ul>
                            </div>
                          )}
                          <div className="citation-list">
                            {claim.answer_citations.map((citation) => {
                              const candidate = candidateBySpan.get(citation.evidence_span_id);
                              return (
                                <figure key={citation.id}>
                                  <blockquote>“{citation.quote_text}”</blockquote>
                                  <figcaption>
                                    {candidateLocation(candidate)} · {citation.citation_role}
                                    {candidate?.candidate_snapshot.scopeMatch
                                      ? ` · scope ${candidate.candidate_snapshot.scopeMatch}`
                                      : ''}
                                    {candidate?.candidate_snapshot.disclosurePolicy
                                      ? ` · ${candidate.candidate_snapshot.disclosurePolicy}`
                                      : ''}
                                  </figcaption>
                                </figure>
                              );
                            })}
                            {claim.answer_citations.length === 0 && (
                              <p className="empty">No supporting citation was accepted.</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <div className="detail-columns">
                    <article className="subpanel">
                      <h3>Confidence dimensions</h3>
                      <dl className="metric-list">
                        {Object.entries(revision.confidence).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{Number(value).toFixed(2)}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                    <article className="subpanel">
                      <h3>Review routing</h3>
                      <p><strong>Risk:</strong> {revision.risk_tier}</p>
                      <p><strong>Required:</strong> {revision.required_reviewers.join(', ') || 'none'}</p>
                      <p><strong>Current role:</strong> {role}</p>
                    </article>
                  </div>

                  <article className="subpanel limitations">
                    <h3>Limitations, contradictions and missing information</h3>
                    {revision.limitations.length === 0 &&
                      revision.contradictions.length === 0 &&
                      revision.missing_information.length === 0 && (
                        <p>No additional limitation was recorded.</p>
                      )}
                    {revision.limitations.map((item) => <p key={item}>Limitation: {item}</p>)}
                    {revision.contradictions.map((item) => <p key={item}>Contradiction: {item}</p>)}
                    {revision.missing_information.map((item) => <p key={item}>Missing: {item}</p>)}
                  </article>

                  <article className="subpanel">
                    <h3>Deterministic validation</h3>
                    <p>
                      {revision.deterministic_validation.passed ? 'Passed' : 'Blocked'} ·{' '}
                      {revision.provider} / {revision.model} · prompt {revision.prompt_version} · schema{' '}
                      {revision.schema_version}
                    </p>
                    {(revision.deterministic_validation.errors ?? []).map((item) => (
                      <p className="error" key={item}>{item}</p>
                    ))}
                    {(revision.deterministic_validation.warnings ?? []).map((item) => (
                      <p className="notice" key={item}>{item}</p>
                    ))}
                  </article>
                </>
              )}

              <article className="subpanel">
                <h3>Provider usage and attempts</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Attempt</th><th>Provider/model</th><th>Tokens</th><th>Latency</th><th>Estimated cost</th></tr></thead>
                    <tbody>
                      {detail.usage.map((item) => (
                        <tr key={item.id}>
                          <td>{item.attempt}</td>
                          <td>{item.provider} / {item.model}</td>
                          <td>{item.input_tokens} in · {item.output_tokens} out</td>
                          <td>{item.latency_ms} ms</td>
                          <td>${(item.cost_micro_usd / 1_000_000).toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.usage.length === 0 && <p className="empty">No provider usage recorded yet.</p>}
              </article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
