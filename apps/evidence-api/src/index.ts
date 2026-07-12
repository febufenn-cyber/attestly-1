import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  ApproveEvidenceInputSchema,
  CreateEvidenceDocumentInputSchema,
  EvidenceSearchInputSchema,
  ExtractEvidenceMessageSchema,
} from '../../../packages/evidence/src/index';

interface QueueProducer {
  send(body: unknown): Promise<void>;
}

interface Bindings {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EXPECTED_SUPABASE_PROJECT_REF: string;
  ALLOWED_ORIGIN: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  EXTRACTION_QUEUE: QueueProducer;
}

type Variables = {
  requestId: string;
  userId: string;
  accessToken: string;
};

type AppEnv = { Bindings: Bindings; Variables: Variables };

class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const IdSchema = z.string().uuid();

function assertEnvironment(env: Bindings): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EXPECTED_SUPABASE_PROJECT_REF',
  ] as const;
  for (const key of required) {
    if (!env[key]) throw new AppError(500, 'environment_invalid', `Missing binding: ${key}`);
  }
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== 'local') {
    const actual = new URL(env.SUPABASE_URL).hostname.split('.')[0];
    if (actual !== env.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new AppError(
        500,
        'environment_mismatch',
        'Supabase project does not match this deployment.',
      );
    }
  }
}

function userClient(env: Bindings, token: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function dispatchOutbox(
  env: Bindings,
  tenantId: string,
  outboxId: string,
): Promise<boolean> {
  const client = serviceClient(env);
  const { data, error } = await client
    .from('evidence_queue_outbox')
    .select('id, payload')
    .eq('tenant_id', tenantId)
    .eq('id', outboxId)
    .is('dispatched_at', null)
    .maybeSingle();
  if (error) {
    throw new AppError(500, 'outbox_read_failed', 'Queued extraction could not be read.');
  }
  if (!data) return true;
  const payload = ExtractEvidenceMessageSchema.parse(data.payload);
  try {
    await env.EXTRACTION_QUEUE.send(payload);
    const { error: updateError } = await client
      .from('evidence_queue_outbox')
      .update({
        dispatched_at: new Date().toISOString(),
        last_error: null,
        dispatch_attempts: 1,
      })
      .eq('tenant_id', tenantId)
      .eq('id', outboxId)
      .is('dispatched_at', null);
    if (updateError) throw updateError;
    return true;
  } catch (reason) {
    await client
      .from('evidence_queue_outbox')
      .update({
        last_error: reason instanceof Error ? reason.message.slice(0, 500) : 'queue error',
      })
      .eq('tenant_id', tenantId)
      .eq('id', outboxId);
    return false;
  }
}

export const app = new Hono<AppEnv>();
app.use('*', secureHeaders());
app.use(
  '*',
  cors({
    origin: (origin, c) => (origin === c.env.ALLOWED_ORIGIN ? origin : c.env.ALLOWED_ORIGIN),
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    exposeHeaders: ['X-Request-ID'],
    maxAge: 600,
  }),
);
app.use('*', async (c, next) => {
  assertEnvironment(c.env);
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
});

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'attestly-evidence-api',
    environment: c.env.ENVIRONMENT,
  }),
);

app.use('/v1/*', async (c, next) => {
  const authorization = c.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new AppError(401, 'unauthorized', 'A valid access token is required.');
  }
  const token = authorization.slice(7).trim();
  const client = userClient(c.env, token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new AppError(401, 'unauthorized', 'The access token is invalid.');
  }
  c.set('userId', data.user.id);
  c.set('accessToken', token);
  await next();
});

app.get('/v1/workspaces', async (c) => {
  const client = userClient(c.env, c.get('accessToken'));
  const { data, error } = await client
    .from('organization_memberships')
    .select('tenant_id, role, organizations!inner(id, name, slug)')
    .eq('user_id', c.get('userId'))
    .eq('status', 'active');
  if (error) {
    throw new AppError(500, 'workspace_list_failed', 'Could not list workspaces.');
  }
  return c.json({ workspaces: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/accepted-objects', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const client = userClient(c.env, c.get('accessToken'));
  const { data, error } = await client
    .from('stored_objects')
    .select(
      'id, file_name, declared_mime_type, detected_mime_type, size_bytes, sha256, status, malware_scan_status, created_at',
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'accepted')
    .not('sha256', 'is', null)
    .order('created_at', { ascending: false });
  if (error) {
    throw new AppError(500, 'object_list_failed', 'Could not list accepted objects.');
  }
  return c.json({ objects: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/evidence-documents', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const client = userClient(c.env, c.get('accessToken'));
  const { data, error } = await client
    .from('evidence_documents')
    .select(
      'id, title, source_type, evidence_class, confidentiality, disclosure_policy, lifecycle_status, current_version_id, created_at, updated_at, evidence_versions(id, version_label, lifecycle_status, extraction_status, index_status, malware_scan_status, extraction_quality, review_due_at, created_at)',
    )
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });
  if (error) {
    throw new AppError(500, 'evidence_list_failed', 'Could not list evidence documents.');
  }
  return c.json({ documents: data ?? [] });
});

app.post('/v1/workspaces/:tenantId/evidence-documents', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const input = CreateEvidenceDocumentInputSchema.parse(await c.req.json());
  const client = userClient(c.env, c.get('accessToken'));
  const { data, error } = await client.rpc('create_evidence_document', {
    p_tenant_id: tenantId,
    p_stored_object_id: input.storedObjectId,
    p_title: input.title,
    p_source_type: input.sourceType,
    p_evidence_class: input.evidenceClass,
    p_confidentiality: input.confidentiality,
    p_disclosure_policy: input.disclosurePolicy,
    p_version_label: input.versionLabel,
    p_scope: input.scope,
    p_effective_from: input.effectiveFrom,
    p_effective_until: input.effectiveUntil,
    p_review_due_at: input.reviewDueAt,
  });
  if (error) {
    throw new AppError(
      error.code === '42501' ? 403 : 400,
      'evidence_create_failed',
      error.message,
    );
  }
  return c.json({ evidence: Array.isArray(data) ? data[0] : data }, 201);
});

app.get('/v1/workspaces/:tenantId/evidence-versions/:versionId', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const versionId = IdSchema.parse(c.req.param('versionId'));
  const client = userClient(c.env, c.get('accessToken'));
  const { data: version, error } = await client
    .from('evidence_versions')
    .select(
      '*, evidence_documents!inner(title, source_type, evidence_class, confidentiality, disclosure_policy), evidence_scopes(*)',
    )
    .eq('tenant_id', tenantId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) {
    throw new AppError(500, 'evidence_read_failed', 'Could not read evidence version.');
  }
  if (!version) throw new AppError(404, 'not_found', 'Evidence version was not found.');
  const [{ data: spans }, { data: warnings }, { data: runs }] = await Promise.all([
    client
      .from('evidence_spans')
      .select(
        'id, local_id, text_content, page_number, sheet_name, cell_range, heading_path, extraction_method, extraction_confidence, source_location',
      )
      .eq('tenant_id', tenantId)
      .eq('evidence_version_id', versionId)
      .order('created_at')
      .limit(500),
    client
      .from('extraction_warnings')
      .select(
        'id, code, severity, message, node_local_id, page_number, sheet_name, resolved_at, resolution',
      )
      .eq('tenant_id', tenantId)
      .eq('evidence_version_id', versionId)
      .order('created_at'),
    client
      .from('extraction_runs')
      .select(
        'id, status, extractor_name, extractor_version, quality, statistics, started_at, completed_at, failure_code',
      )
      .eq('tenant_id', tenantId)
      .eq('evidence_version_id', versionId)
      .order('created_at', { ascending: false }),
  ]);
  return c.json({
    version,
    spans: spans ?? [],
    warnings: warnings ?? [],
    extractionRuns: runs ?? [],
  });
});

app.post('/v1/workspaces/:tenantId/evidence-versions/:versionId/extract', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const versionId = IdSchema.parse(c.req.param('versionId'));
  const client = userClient(c.env, c.get('accessToken'));
  const requestId = IdSchema.parse(c.get('requestId'));
  const { data, error } = await client.rpc('start_evidence_extraction', {
    p_tenant_id: tenantId,
    p_evidence_version_id: versionId,
    p_correlation_id: requestId,
  });
  if (error) {
    throw new AppError(
      error.code === '42501' ? 403 : 400,
      'extraction_start_failed',
      error.message,
    );
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.job_id || !result?.outbox_id) {
    throw new AppError(500, 'extraction_job_missing', 'Extraction job was not created.');
  }
  const queued = await dispatchOutbox(c.env, tenantId, result.outbox_id);
  return c.json({ jobId: result.job_id, queued }, 202);
});

app.post('/v1/workspaces/:tenantId/evidence-versions/:versionId/approve', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const versionId = IdSchema.parse(c.req.param('versionId'));
  const input = ApproveEvidenceInputSchema.parse(await c.req.json());
  const client = userClient(c.env, c.get('accessToken'));
  const { error } = await client.rpc('approve_evidence_version', {
    p_tenant_id: tenantId,
    p_evidence_version_id: versionId,
    p_rationale: input.rationale,
    p_restricted: input.restricted,
  });
  if (error) {
    throw new AppError(
      error.code === '42501' ? 403 : 400,
      'evidence_approval_failed',
      error.message,
    );
  }
  return c.json({ approved: true });
});

app.post('/v1/workspaces/:tenantId/evidence/search', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const input = EvidenceSearchInputSchema.parse(await c.req.json());
  const client = userClient(c.env, c.get('accessToken'));
  const { data, error } = await client.rpc('search_evidence', {
    p_tenant_id: tenantId,
    p_query: input.query,
    p_requested_scope: input.requestedScope,
    p_operation: input.operation,
    p_include_historical: input.includeHistorical,
    p_limit: input.limit,
  });
  if (error) {
    throw new AppError(
      error.code === '42501' ? 403 : 400,
      'evidence_search_failed',
      error.message,
    );
  }
  return c.json({ candidates: data ?? [] });
});

app.onError((error, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  if (error instanceof z.ZodError) {
    return c.json(
      {
        error: {
          code: 'validation_failed',
          message: 'The request did not match the expected schema.',
          requestId,
          details: error.flatten(),
        },
      },
      400,
    );
  }
  const known = error instanceof AppError;
  return c.json(
    {
      error: {
        code: known ? error.code : 'internal_error',
        message: known ? error.message : 'An unexpected error occurred.',
        requestId,
        ...(known && error.details ? { details: error.details } : {}),
      },
    },
    (known ? error.status : 500) as 400 | 401 | 403 | 404 | 500,
  );
});

export default app;
