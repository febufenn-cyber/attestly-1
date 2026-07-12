import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  compileExportPlan,
  type AnswerDestination,
  type QuestionnaireCondition,
  type QuestionnaireQuestion,
} from '../../../packages/questionnaire/src/index';
import {
  CreateExportPlanInputSchema,
  CreateQuestionnaireArtifactInputSchema,
  ExportQuestionnaireMessageSchema,
  FreezeSnapshotInputSchema,
  IdSchema,
  InspectQuestionnaireMessageSchema,
  MappingRevisionInputSchema,
  QuestionnaireQueueMessageSchema,
} from '../../../packages/questionnaire/src/contracts';

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
  QUESTIONNAIRE_QUEUE: QueueProducer;
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

function assertEnvironment(env: Bindings): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EXPECTED_SUPABASE_PROJECT_REF',
  ] as const;
  for (const key of required) if (!env[key]) throw new AppError(500, 'environment_invalid', `Missing binding: ${key}`);
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== 'local') {
    const actual = new URL(env.SUPABASE_URL).hostname.split('.')[0];
    if (actual !== env.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new AppError(500, 'environment_mismatch', 'Supabase project does not match this deployment.');
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
    .from('questionnaire_queue_outbox')
    .select('id, payload, dispatch_attempts')
    .eq('tenant_id', tenantId)
    .eq('id', outboxId)
    .is('dispatched_at', null)
    .maybeSingle();
  if (error) throw new AppError(500, 'outbox_read_failed', 'Queued questionnaire work could not be read.');
  if (!data) return true;
  const payload = QuestionnaireQueueMessageSchema.parse(data.payload);
  try {
    await env.QUESTIONNAIRE_QUEUE.send(payload);
    const { error: updateError } = await client
      .from('questionnaire_queue_outbox')
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
  } catch (error) {
    await client
      .from('questionnaire_queue_outbox')
      .update({
        last_error: error instanceof Error ? error.message.slice(0, 500) : 'queue error',
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
    origin: (origin, context) => (origin === context.env.ALLOWED_ORIGIN ? origin : context.env.ALLOWED_ORIGIN),
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    exposeHeaders: ['X-Request-ID'],
    maxAge: 600,
  }),
);
app.use('*', async (context, next) => {
  assertEnvironment(context.env);
  const requestId = context.req.header('x-request-id') ?? crypto.randomUUID();
  context.set('requestId', requestId);
  context.header('X-Request-ID', requestId);
  await next();
});

app.get('/health', (context) =>
  context.json({ status: 'ok', service: 'attestly-questionnaire-api', environment: context.env.ENVIRONMENT }),
);

app.use('/v1/*', async (context, next) => {
  const authorization = context.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AppError(401, 'unauthorized', 'A valid access token is required.');
  const token = authorization.slice(7).trim();
  const client = userClient(context.env, token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new AppError(401, 'unauthorized', 'The access token is invalid.');
  context.set('userId', data.user.id);
  context.set('accessToken', token);
  await next();
});

app.get('/v1/workspaces', async (context) => {
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client
    .from('organization_memberships')
    .select('tenant_id, role, organizations!inner(id, name, slug)')
    .eq('user_id', context.get('userId'))
    .eq('status', 'active');
  if (error) throw new AppError(500, 'workspace_list_failed', 'Could not list workspaces.');
  return context.json({ workspaces: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/accepted-objects', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client
    .from('stored_objects')
    .select('id, file_name, detected_mime_type, declared_mime_type, size_bytes, sha256, status, malware_scan_status, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'accepted')
    .not('sha256', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(500, 'object_list_failed', 'Could not list accepted questionnaire objects.');
  return context.json({ objects: data ?? [] });
});

app.get('/v1/workspaces/:tenantId/questionnaires', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client
    .from('questionnaire_artifacts')
    .select(
      'id, stored_object_id, source_sha256, format, original_filename, lifecycle_status, created_at, questionnaire_import_runs(id, status, compatibility_status, structural_fingerprint, statistics, created_at, completed_at), questionnaire_mapping_versions(id, version_number, status, compatibility_status, target_scope, created_at, frozen_at), questionnaire_snapshots(id, snapshot_hash, status, question_count, atomic_request_count, frozen_at)',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(500, 'questionnaire_list_failed', 'Could not list questionnaires.');
  return context.json({ questionnaires: data ?? [] });
});

app.post('/v1/workspaces/:tenantId/questionnaires', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const input = CreateQuestionnaireArtifactInputSchema.parse(await context.req.json());
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client.rpc('create_questionnaire_artifact', {
    p_tenant_id: tenantId,
    p_stored_object_id: input.storedObjectId,
    p_format: input.format,
  });
  if (error) throw new AppError(400, 'questionnaire_create_failed', error.message);
  return context.json({ questionnaireArtifactId: data }, 201);
});

app.post('/v1/workspaces/:tenantId/questionnaires/:artifactId/imports', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const artifactId = IdSchema.parse(context.req.param('artifactId'));
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client.rpc('start_questionnaire_import', {
    p_tenant_id: tenantId,
    p_questionnaire_artifact_id: artifactId,
    p_correlation_id: context.get('requestId'),
  });
  if (error) throw new AppError(400, 'questionnaire_import_failed', error.message);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.job_id || !result?.outbox_id) throw new AppError(500, 'questionnaire_import_failed', 'Import did not create queued work.');
  const queued = await dispatchOutbox(context.env, tenantId, result.outbox_id);
  return context.json({ jobId: result.job_id, queued }, 202);
});

app.get('/v1/workspaces/:tenantId/mappings/:mappingId', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const mappingId = IdSchema.parse(context.req.param('mappingId'));
  const client = userClient(context.env, context.get('accessToken'));
  const [mapping, questions, destinations, conditions, instructions, warnings] = await Promise.all([
    client
      .from('questionnaire_mapping_versions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', mappingId)
      .single(),
    client
      .from('questionnaire_questions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', mappingId)
      .order('display_order'),
    client
      .from('questionnaire_answer_destinations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', mappingId),
    client
      .from('questionnaire_conditions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', mappingId),
    client
      .from('questionnaire_instructions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', mappingId),
    client
      .from('questionnaire_import_warnings')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', mappingId)
      .order('created_at'),
  ]);
  const firstError = [mapping.error, questions.error, destinations.error, conditions.error, instructions.error, warnings.error].find(Boolean);
  if (firstError) throw new AppError(500, 'mapping_read_failed', 'Could not load the questionnaire mapping.');
  return context.json({
    mapping: mapping.data,
    questions: questions.data ?? [],
    destinations: destinations.data ?? [],
    conditions: conditions.data ?? [],
    instructions: instructions.data ?? [],
    warnings: warnings.data ?? [],
  });
});

app.post('/v1/workspaces/:tenantId/mappings/:mappingId/revisions', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const mappingId = IdSchema.parse(context.req.param('mappingId'));
  const input = MappingRevisionInputSchema.parse(await context.req.json());
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client.rpc('create_questionnaire_mapping_revision', {
    p_tenant_id: tenantId,
    p_parent_mapping_version_id: mappingId,
    p_mapping: input.mapping,
    p_target_scope: input.targetScope,
    p_notes: input.notes,
  });
  if (error) throw new AppError(400, 'mapping_revision_failed', error.message);
  return context.json({ mappingVersionId: data }, 201);
});

app.post('/v1/workspaces/:tenantId/warnings/:warningId/resolve', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const warningId = IdSchema.parse(context.req.param('warningId'));
  const body = z.object({ resolution: z.string().trim().min(3).max(4000) }).parse(await context.req.json());
  const client = userClient(context.env, context.get('accessToken'));
  const { error } = await client.rpc('resolve_questionnaire_warning', {
    p_tenant_id: tenantId,
    p_warning_id: warningId,
    p_resolution: body.resolution,
  });
  if (error) throw new AppError(400, 'warning_resolution_failed', error.message);
  return context.body(null, 204);
});

app.post('/v1/workspaces/:tenantId/mappings/:mappingId/freeze', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const mappingId = IdSchema.parse(context.req.param('mappingId'));
  const input = FreezeSnapshotInputSchema.parse(await context.req.json());
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client.rpc('freeze_questionnaire_snapshot', {
    p_tenant_id: tenantId,
    p_mapping_version_id: mappingId,
    p_snapshot_hash: input.snapshotHash,
    p_target_scope: input.targetScope,
  });
  if (error) throw new AppError(400, 'snapshot_freeze_failed', error.message);
  return context.json({ questionnaireSnapshotId: data }, 201);
});

app.get('/v1/workspaces/:tenantId/snapshots/:snapshotId', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const snapshotId = IdSchema.parse(context.req.param('snapshotId'));
  const client = userClient(context.env, context.get('accessToken'));
  const { data: snapshot, error } = await client
    .from('questionnaire_snapshots')
    .select('*, questionnaire_mapping_versions(*)')
    .eq('tenant_id', tenantId)
    .eq('id', snapshotId)
    .single();
  if (error || !snapshot) throw new AppError(404, 'snapshot_not_found', 'Questionnaire snapshot was not found.');
  return context.json({ snapshot });
});

app.post('/v1/workspaces/:tenantId/snapshots/:snapshotId/export-plans', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const snapshotId = IdSchema.parse(context.req.param('snapshotId'));
  const input = CreateExportPlanInputSchema.parse(await context.req.json());
  const client = userClient(context.env, context.get('accessToken'));
  const { data: snapshot, error: snapshotError } = await client
    .from('questionnaire_snapshots')
    .select('id, mapping_version_id, status')
    .eq('tenant_id', tenantId)
    .eq('id', snapshotId)
    .single();
  if (snapshotError || !snapshot) throw new AppError(404, 'snapshot_not_found', 'Questionnaire snapshot was not found.');

  const [questionsResult, destinationsResult, conditionsResult] = await Promise.all([
    client
      .from('questionnaire_questions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', snapshot.mapping_version_id)
      .order('display_order'),
    client
      .from('questionnaire_answer_destinations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', snapshot.mapping_version_id),
    client
      .from('questionnaire_conditions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('mapping_version_id', snapshot.mapping_version_id),
  ]);
  if (questionsResult.error || destinationsResult.error || conditionsResult.error) {
    throw new AppError(500, 'export_plan_failed', 'Snapshot mapping could not be loaded.');
  }

  const questions = (questionsResult.data ?? []).map((row) => ({
    localId: row.local_id,
    externalIdentifier: row.external_identifier ?? undefined,
    originalText: row.original_text,
    normalizedText: row.normalized_text,
    type: row.question_type,
    polarity: row.polarity,
    displayOrder: row.display_order,
    sectionPath: (row.source_location?.sectionPath as string[] | undefined) ?? [],
    sourceLocation: row.source_location,
    answerFormat: row.answer_format,
    answerDestinationLocalIds: (destinationsResult.data ?? [])
      .filter((destination) => destination.question_local_id === row.local_id || !destination.question_local_id)
      .map((destination) => destination.local_id),
    atomicRequests: [],
    parentLocalId: row.parent_local_id ?? undefined,
    inclusionStatus: row.inclusion_status,
    confidence: row.mapping_confidence,
    parserNotes: row.parser_notes ?? [],
  })) as QuestionnaireQuestion[];
  const destinations = (destinationsResult.data ?? []).map((row) => ({
    localId: row.local_id,
    type: row.destination_type,
    location: row.source_location,
    expectedValueType: row.expected_value_type,
    allowedValues: row.allowed_values ?? [],
    storedValues: row.stored_values ?? {},
    formulaPresent: row.formula_present,
    protected: row.protected,
    styleHash: row.style_hash ?? undefined,
    validationHash: row.validation_hash ?? undefined,
    writeStrategy: row.write_strategy,
  })) as AnswerDestination[];
  const conditions = (conditionsResult.data ?? []).map((row) => ({
    localId: row.local_id,
    childQuestionLocalId: row.child_question_local_id,
    originalInstruction: row.original_instruction,
    expression: row.expression,
    parserConfidence: Number(row.parser_confidence),
    humanConfirmed: row.human_confirmed,
  })) as QuestionnaireCondition[];

  const compiled = compileExportPlan({ questions, destinations, conditions, answers: input.answers });
  const { data, error } = await client.rpc('create_questionnaire_export_plan', {
    p_tenant_id: tenantId,
    p_questionnaire_snapshot_id: snapshotId,
    p_answer_snapshot_hash: input.answerSnapshotHash,
    p_operations: compiled.operations,
    p_blocking_errors: compiled.blockingErrors,
  });
  if (error) throw new AppError(400, 'export_plan_failed', error.message);
  return context.json({ exportPlanId: data, ...compiled }, 201);
});

app.post('/v1/workspaces/:tenantId/export-plans/:planId/validate', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const planId = IdSchema.parse(context.req.param('planId'));
  const client = userClient(context.env, context.get('accessToken'));
  const { error } = await client.rpc('validate_questionnaire_export_plan', {
    p_tenant_id: tenantId,
    p_export_plan_id: planId,
  });
  if (error) throw new AppError(400, 'export_plan_validation_failed', error.message);
  return context.body(null, 204);
});

app.post('/v1/workspaces/:tenantId/export-plans/:planId/execute', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const planId = IdSchema.parse(context.req.param('planId'));
  const client = userClient(context.env, context.get('accessToken'));
  const outputObjectId = crypto.randomUUID();
  const { data, error } = await client.rpc('start_questionnaire_export', {
    p_tenant_id: tenantId,
    p_export_plan_id: planId,
    p_output_object_id: outputObjectId,
    p_correlation_id: context.get('requestId'),
  });
  if (error) throw new AppError(400, 'export_start_failed', error.message);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.job_id || !result?.outbox_id || !result?.export_run_id) {
    throw new AppError(500, 'export_start_failed', 'Export did not create queued work.');
  }
  const queued = await dispatchOutbox(context.env, tenantId, result.outbox_id);
  return context.json(
    {
      jobId: result.job_id,
      exportRunId: result.export_run_id,
      outputObjectId,
      queued,
    },
    202,
  );
});

app.get('/v1/workspaces/:tenantId/export-runs', async (context) => {
  const tenantId = IdSchema.parse(context.req.param('tenantId'));
  const client = userClient(context.env, context.get('accessToken'));
  const { data, error } = await client
    .from('questionnaire_export_runs')
    .select('*, questionnaire_export_diffs(*)')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) throw new AppError(500, 'export_run_list_failed', 'Could not list export runs.');
  return context.json({ exportRuns: data ?? [] });
});

app.onError((error, context) => {
  const requestId = context.get('requestId') ?? crypto.randomUUID();
  const validation = error instanceof z.ZodError;
  const known = error instanceof AppError;
  const status = known ? error.status : validation ? 400 : 500;
  return context.json(
    {
      error: {
        code: known ? error.code : validation ? 'validation_failed' : 'internal_error',
        message: known
          ? error.message
          : validation
            ? 'The request did not match the expected schema.'
            : 'An unexpected error occurred.',
        requestId,
        ...(validation ? { details: error.flatten() } : {}),
      },
    },
    status as 400 | 401 | 404 | 500,
  );
});

export default app;
