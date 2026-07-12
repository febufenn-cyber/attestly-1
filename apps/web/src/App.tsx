import type { Session } from '@supabase/supabase-js';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { storageBucket, supabase } from './supabase';

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';

type Workspace = {
  tenant_id: string;
  role: string;
  organizations: { id: string; name: string; slug: string; created_at: string };
};

type StoredObject = {
  id: string;
  file_name: string;
  declared_mime_type: string;
  detected_mime_type: string | null;
  size_bytes: number;
  sha256: string | null;
  status: string;
  created_at: string;
  validated_at: string | null;
};

type Job = {
  id: string;
  type: string;
  status: string;
  object_id: string;
  attempt_count: number;
  last_error_code: string | null;
  created_at: string;
};

type AuditEvent = {
  id: string;
  action: string;
  actor_type: string;
  target_type: string;
  occurred_at: string;
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
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string; code?: string } }
      | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string>('');
  const [objects, setObjects] = useState<StoredObject[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const activeWorkspace = useMemo(
    () => workspaces.find((item) => item.tenant_id === activeTenantId),
    [activeTenantId, workspaces],
  );

  const loadWorkspaces = useCallback(async (currentSession: Session) => {
    const result = await api<{ workspaces: Workspace[] }>(currentSession, '/v1/me/workspaces');
    setWorkspaces(result.workspaces);
    setActiveTenantId((current) => current || result.workspaces[0]?.tenant_id || '');
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    if (!session || !activeTenantId) return;
    const [objectResult, jobResult] = await Promise.all([
      api<{ objects: StoredObject[] }>(session, `/v1/workspaces/${activeTenantId}/objects`),
      api<{ jobs: Job[] }>(session, `/v1/workspaces/${activeTenantId}/jobs`),
    ]);
    setObjects(objectResult.objects);
    setJobs(jobResult.jobs);
    try {
      const auditResult = await api<{ events: AuditEvent[] }>(
        session,
        `/v1/workspaces/${activeTenantId}/audit-events`,
      );
      setAuditEvents(auditResult.events);
    } catch {
      setAuditEvents([]);
    }
  }, [activeTenantId, session]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadWorkspaces(session).catch((reason: Error) => setError(reason.message));
  }, [loadWorkspaces, session]);

  useEffect(() => {
    if (!session || !activeTenantId) return;
    void loadWorkspaceData().catch((reason: Error) => setError(reason.message));
    const timer = window.setInterval(() => {
      void loadWorkspaceData().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeTenantId, loadWorkspaceData, session]);

  useEffect(() => {
    if (!session) return;
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) return;
    void api<{ tenantId: string }>(session, '/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(async ({ tenantId }) => {
        window.history.replaceState({}, '', window.location.pathname);
        await loadWorkspaces(session);
        setActiveTenantId(tenantId);
        setNotice('Invitation accepted.');
      })
      .catch((reason: Error) => setError(reason.message));
  }, [loadWorkspaces, session]);

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

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await api(session, '/v1/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: workspaceName, slug: workspaceSlug }),
      });
      setWorkspaceName('');
      setWorkspaceSlug('');
      await loadWorkspaces(session);
      setNotice('Workspace created.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Workspace creation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (!session || !activeTenantId) return;
    setBusy(true);
    setError('');
    try {
      const intent = await api<{
        object: { id: string };
        upload: { path: string; token: string };
      }>(session, `/v1/workspaces/${activeTenantId}/objects/upload-intents`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });
      const { error: uploadError } = await supabase.storage
        .from(storageBucket)
        .uploadToSignedUrl(intent.upload.path, intent.upload.token, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      await api(session, `/v1/workspaces/${activeTenantId}/objects/${intent.object.id}/complete`, {
        method: 'POST',
        body: '{}',
      });
      await loadWorkspaceData();
      setNotice('Upload completed. Validation is running asynchronously.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault();
    if (!session || !activeTenantId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ inviteUrl: string }>(
        session,
        `/v1/workspaces/${activeTenantId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify({ email: inviteEmail, role: 'contributor', expiresInHours: 72 }),
        },
      );
      setInviteUrl(result.inviteUrl);
      setInviteEmail('');
      setNotice('Invitation created. The token is shown once; share it securely.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invitation failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="sign-in-title">
          <span className="eyebrow">Evidence-grounded questionnaire review</span>
          <h1 id="sign-in-title">Attestly</h1>
          <p>Sign in with a one-time link. Passwords and service credentials never enter this app.</p>
          <form onSubmit={signIn} className="stack">
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <button disabled={busy}>{busy ? 'Sending…' : 'Send secure sign-in link'}</button>
          </form>
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Secure foundation</span>
          <h1>Attestly</h1>
        </div>
        <div className="topbar-actions">
          <label>
            <span className="sr-only">Active workspace</span>
            <select value={activeTenantId} onChange={(event) => setActiveTenantId(event.target.value)}>
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.tenant_id} value={workspace.tenant_id}>
                  {workspace.organizations.name} · {workspace.role}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      {(notice || error) && (
        <div className={error ? 'banner error' : 'banner notice'} role={error ? 'alert' : 'status'}>
          {error || notice}
          <button className="dismiss" onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss">×</button>
        </div>
      )}

      <section className="grid">
        <article className="panel">
          <h2>Create workspace</h2>
          <form onSubmit={createWorkspace} className="stack compact">
            <label>Name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required /></label>
            <label>Slug<input value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value.toLowerCase())} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
            <button disabled={busy}>Create</button>
          </form>
        </article>

        <article className="panel">
          <h2>Immutable evidence upload</h2>
          <p>PDF, DOCX, XLSX, CSV, or TXT; maximum 25 MB. Uploaded content remains quarantined until validation succeeds.</p>
          <label className="file-button">
            {busy ? 'Working…' : 'Choose file'}
            <input
              type="file"
              disabled={busy || !activeTenantId}
              accept=".pdf,.docx,.xlsx,.csv,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
                event.target.value = '';
              }}
            />
          </label>
        </article>

        <article className="panel">
          <h2>Invite contributor</h2>
          <form onSubmit={createInvitation} className="stack compact">
            <label>Email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required /></label>
            <button disabled={busy || activeWorkspace?.role !== 'admin'}>Create one-time invite</button>
          </form>
          {inviteUrl && <output className="invite-output">{inviteUrl}</output>}
        </article>
      </section>

      <section className="panel wide">
        <div className="section-heading"><div><span className="eyebrow">Tenant-owned objects</span><h2>Evidence lifecycle</h2></div><button className="secondary" onClick={() => void loadWorkspaceData()}>Refresh</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>File</th><th>Status</th><th>Type</th><th>Size</th><th>Hash</th></tr></thead>
            <tbody>
              {objects.map((object) => (
                <tr key={object.id}>
                  <td>{object.file_name}</td><td><span className={`status status-${object.status}`}>{object.status.replaceAll('_', ' ')}</span></td>
                  <td>{object.detected_mime_type ?? object.declared_mime_type}</td><td>{formatBytes(object.size_bytes)}</td><td className="mono">{object.sha256?.slice(0, 16) ?? 'pending'}</td>
                </tr>
              ))}
              {!objects.length && <tr><td colSpan={5} className="empty">No evidence uploaded in this workspace.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="split">
        <article className="panel">
          <h2>Background jobs</h2>
          <ul className="timeline">
            {jobs.map((job) => <li key={job.id}><strong>{job.type.replaceAll('_', ' ')}</strong><span>{job.status.replaceAll('_', ' ')} · attempt {job.attempt_count}</span>{job.last_error_code && <small>{job.last_error_code}</small>}</li>)}
            {!jobs.length && <li className="empty">No jobs yet.</li>}
          </ul>
        </article>
        <article className="panel">
          <h2>Audit trail</h2>
          <ul className="timeline">
            {auditEvents.map((event) => <li key={event.id}><strong>{event.action}</strong><span>{event.actor_type} · {event.target_type}</span><small>{new Date(event.occurred_at).toLocaleString()}</small></li>)}
            {!auditEvents.length && <li className="empty">Audit events are visible to administrators and auditors.</li>}
          </ul>
        </article>
      </section>
    </main>
  );
}
