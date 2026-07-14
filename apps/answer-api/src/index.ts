import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  GenerateAnswerMessageSchema,
  RequestAnswerGenerationSchema,
} from '../../../packages/answer/src/contracts';

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
  GENERATION_PROVIDER: 'fake' | 'anthropic';
  GENERATION_MODEL: string;
  GENERATION_MODEL_VERSION: string;
  GENERATION_PROMPT_VERSION: string;
  GENERATION_QUEUE: QueueProducer;
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
    'GENERATION_PROVIDER',
    'GENERATION_MODEL',
    'GENERATION_PROMPT_VERSION',
  ] as const;
  for (const key of required) {
    if (!env[key]) throw new AppError(500, 'environment_invalid', `Missing binding: ${key}`);
  }
  if (!['fake', 'anthropic'].includes(env.GENERATION_PROVIDER)) {
    throw new AppError(500, 'provider_invalid', 'Configured generation provider is unsupported.');
  }
  if (env.ENVIRONMENT === 'production' && env.GENERATION_PROVIDER === 'fake') {
    throw new AppError(
      500,
      'provider_invalid',
      'The deterministic fake provider cannot run in production.',
    );
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

async function dispatchOutbox(env: Bindings, tenantId: string, outboxId: string): Promise<boolean> {
  const client = serviceClient(env);
  const { data, error } = await client
    .from('generation_queue_outbox')
    .select('id, payload, dispatch_attempts')
    .eq('tenant_id', tenantId)
    .eq('id', outboxId)
    .is('dispatched_at', null)
    .maybeSingle();
  if (error) throw new AppError(500, 'outbox_read_failed', 'Queued generation could not be read.');
  if (!data) return true;
  const payload = GenerateAnswerMessageSchema.parse(data.payload);
  try {
    await env.GENERATION_QUEUE.send(payload);
    const { error: updateError } = await client
      .from('generation_queue_outbox')
      .update({
        dispatched_at: new Date().toISOString(),
        last_error: null,
        dispatch_attempts: (data.dispatch_attempts ?? 0) + 1,
      })
      .eq('tenant_id', tenantId)
      .eq('id', outboxId)
      .is('dispatched_at', null);
    if (updateError) throw updateError;
    return true;
  } catch (reason) {
    await client
      .from('generation_queue_outbox')
      .update({
        last_error: reason instanceof Error ? reason.message.slice(0, 500) : 'queue error',
        dispatch_attempts: (data.dispatch_attempts ?? 0) + 1,
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
    service: 'attestly-answer-api',
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
  if (error || !data.user) throw new AppError(401, 'unauthorized', 'The access token is invalid.');
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
  if (error) throw new AppError(500, 'workspace_list_failed', 'Could not list workspaces.');
  return c.json({ workspaces: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/snapshots', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const client = userClient(c.env, c.get('accessToken'));
  const { data, error } = await client
    .from('questionnaire_snapshots')
    .select(
      'id, snapshot_hash, status, target_scope, question_count, atomic_request_count, frozen_at',
    )
    .eq('tenant_id', tenantId)
    .in('status', ['frozen', 'answering', 'review', 'approved'])
    .order('frozen_at', { ascending: false });
  if (error)
    throw new AppError(500, 'snapshot_list_failed', 'Could not list questionnaire snapshots.');
  return c.json({ snapshots: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/snapshots/:snapshotId/questions', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const snapshotId = IdSchema.parse(c.req.param('snapshotId'));
  const client = userClient(c.env, c.get('accessToken'));
  const { data: snapshot, error: snapshotError } = await client
    .from('questionnaire_snapshots')
    .select('id, mapping_version_id')
    .eq('tenant_id', tenantId)
    .eq('id', snapshotId)
    .maybeSingle();
  if (snapshotError)
    throw new AppError(500, 'snapshot_read_failed', 'Could not read the snapshot.');
  if (!snapshot) throw new AppError(404, 'not_found', 'Questionnaire snapshot was not found.');
  const { data, error } = await client
    .from('questionnaire_questions')
    .select(
      'id, local_id, original_text, normalized_text, question_type, polarity, display_order, answer_format, source_location',
    )
    .eq('tenant_id', tenantId)
    .eq('mapping_version_id', snapshot.mapping_version_id)
    .eq('inclusion_status', 'included')
    .order('display_order');
  if (error) throw new AppError(500, 'question_list_failed', 'Could not list snapshot questions.');
  return c.json({ questions: data ?? [] });
});

app.post(
  '/v1/workspaces/:tenantId/snapshots/:snapshotId/questions/:questionId/generations',
  async (c) => {
    const tenantId = IdSchema.parse(c.req.param('tenantId'));
    const snapshotId = IdSchema.parse(c.req.param('snapshotId'));
    const questionId = IdSchema.parse(c.req.param('questionId'));
    const input = RequestAnswerGenerationSchema.parse(await c.req.json().catch(() => ({})));
    const requestId = IdSchema.parse(c.get('requestId'));
    const client = userClient(c.env, c.get('accessToken'));
    const { data, error } = await client.rpc('request_answer_generation', {
      p_tenant_id: tenantId,
      p_questionnaire_snapshot_id: snapshotId,
      p_question_id: questionId,
      p_operation: input.operation,
      p_provider: c.env.GENERATION_PROVIDER,
      p_model: c.env.GENERATION_MODEL,
      p_model_version: c.env.GENERATION_MODEL_VERSION || null,
      p_prompt_version: c.env.GENERATION_PROMPT_VERSION,
      p_schema_version: 1,
      p_correlation_id: requestId,
    });
    if (error) {
      throw new AppError(
        error.code === '42501' ? 403 : 400,
        'generation_request_failed',
        error.message,
      );
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.generation_run_id || !result?.outbox_id) {
      throw new AppError(500, 'generation_job_missing', 'Generation run was not created.');
    }
    const queued = await dispatchOutbox(c.env, tenantId, result.outbox_id);
    return c.json({ generationRunId: result.generation_run_id, jobId: result.job_id, queued }, 202);
  },
);

app.get('/v1/workspaces/:tenantId/generations', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const snapshotId = c.req.query('snapshotId');
  const client = userClient(c.env, c.get('accessToken'));
  let query = client
    .from('generation_runs')
    .select(
      'id, questionnaire_snapshot_id, question_id, operation, status, provider, model, model_version, prompt_version, failure_code, created_at, started_at, completed_at, failed_at',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (snapshotId) query = query.eq('questionnaire_snapshot_id', IdSchema.parse(snapshotId));
  const { data, error } = await query;
  if (error) throw new AppError(500, 'generation_list_failed', 'Could not list generation runs.');
  return c.json({ generations: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/generations/:runId', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const runId = IdSchema.parse(c.req.param('runId'));
  const client = userClient(c.env, c.get('accessToken'));
  const { data: run, error } = await client
    .from('generation_runs')
    .select(
      '*, questionnaire_questions!inner(id, local_id, original_text, normalized_text, question_type, polarity, answer_format, source_location)',
    )
    .eq('tenant_id', tenantId)
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new AppError(500, 'generation_read_failed', 'Could not read generation run.');
  if (!run) throw new AppError(404, 'not_found', 'Generation run was not found.');
  const [{ data: candidates }, { data: revisions }, { data: usage }] = await Promise.all([
    client
      .from('generation_candidates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('generation_run_id', runId)
      .order('candidate_order'),
    client
      .from('answer_revisions')
      .select('*, answer_claims(*, answer_citations(*))')
      .eq('tenant_id', tenantId)
      .eq('generation_run_id', runId)
      .order('revision_number'),
    client
      .from('generation_provider_usage')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('generation_run_id', runId)
      .order('attempt'),
  ]);
  return c.json({
    run,
    candidates: candidates ?? [],
    revisions: revisions ?? [],
    usage: usage ?? [],
  });
});

app.post('/v1/workspaces/:tenantId/generations/:runId/cancel', async (c) => {
  const tenantId = IdSchema.parse(c.req.param('tenantId'));
  const runId = IdSchema.parse(c.req.param('runId'));
  const client = userClient(c.env, c.get('accessToken'));
  const { error } = await client.rpc('cancel_generation_run', {
    p_tenant_id: tenantId,
    p_generation_run_id: runId,
  });
  if (error)
    throw new AppError(
      error.code === '42501' ? 403 : 400,
      'generation_cancel_failed',
      error.message,
    );
  return c.json({ cancelled: true });
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
  const status = (known ? error.status : 500) as 400 | 401 | 403 | 404 | 500;
  return c.json(
    {
      error: {
        code: known ? error.code : 'internal_error',
        message: known ? error.message : 'The request could not be completed.',
        requestId,
        details: known ? error.details : undefined,
      },
    },
    status,
  );
});

export default app;
