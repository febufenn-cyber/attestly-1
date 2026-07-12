import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { retryDelaySeconds } from '../../../packages/foundation/src/index';
import { QuestionnaireManifestSchema } from '../../../packages/questionnaire/src/index';
import {
  ExportQuestionnaireMessageSchema,
  InspectQuestionnaireMessageSchema,
  QuestionnaireQueueMessageSchema,
  type QuestionnaireQueueMessage,
} from '../../../packages/questionnaire/src/contracts';

interface QueueMessage<T> {
  body: T;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}
interface QueueBatch<T> {
  messages: Array<QueueMessage<T>>;
}
interface QueueProducer {
  send(body: unknown): Promise<void>;
}
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

export interface QuestionnaireWorkerBindings {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EXPECTED_SUPABASE_PROJECT_REF: string;
  PROCESSOR_URL: string;
  PROCESSOR_INTERNAL_TOKEN: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  QUESTIONNAIRE_QUEUE: QueueProducer;
}

class TerminalQuestionnaireError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function dbClient(env: QuestionnaireWorkerBindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertEnvironment(env: QuestionnaireWorkerBindings): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EXPECTED_SUPABASE_PROJECT_REF',
    'PROCESSOR_URL',
    'PROCESSOR_INTERNAL_TOKEN',
  ] as const;
  for (const key of required) if (!env[key]) throw new TerminalQuestionnaireError('environment_invalid', `Missing binding: ${key}`);
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== 'local') {
    const actual = new URL(env.SUPABASE_URL).hostname.split('.')[0];
    if (actual !== env.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new TerminalQuestionnaireError('environment_mismatch', 'Worker is bound to the wrong Supabase project.');
    }
  }
  const processor = new URL(env.PROCESSOR_URL);
  if (env.ENVIRONMENT === 'production' && processor.protocol !== 'https:') {
    throw new TerminalQuestionnaireError('processor_transport_invalid', 'Production processor traffic must use HTTPS.');
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function leaseJob(db: SupabaseClient, message: QuestionnaireQueueMessage): Promise<string | undefined> {
  const leaseOwner = crypto.randomUUID();
  const { data, error } = await db.rpc('lease_job', {
    p_tenant_id: message.tenantId,
    p_job_id: message.jobId,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 900,
  });
  if (error) throw new Error(`lease_failed:${error.code ?? 'unknown'}`);
  if (!data) return undefined;
  const { error: runningError } = await db
    .from('jobs')
    .update({ status: 'running' })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId)
    .eq('lease_owner', leaseOwner)
    .eq('status', 'leased');
  if (runningError) throw new Error(`job_start_failed:${runningError.code ?? 'unknown'}`);
  return leaseOwner;
}

async function completeJob(db: SupabaseClient, message: QuestionnaireQueueMessage, leaseOwner: string): Promise<void> {
  const { error } = await db
    .from('jobs')
    .update({
      status: 'succeeded',
      completed_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error_code: null,
      last_error_detail: null,
    })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId)
    .eq('lease_owner', leaseOwner);
  if (error) throw new Error(`job_complete_failed:${error.code ?? 'unknown'}`);
}

async function signSource(db: SupabaseClient, bucket: string, path: string): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(`source_sign_failed:${error?.message ?? 'unknown'}`);
  return data.signedUrl;
}

async function signDestination(db: SupabaseClient, supabaseUrl: string, bucket: string, path: string): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.token) throw new Error(`destination_sign_failed:${error?.message ?? 'unknown'}`);
  if ('signedUrl' in data && typeof data.signedUrl === 'string') return data.signedUrl;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}?token=${encodeURIComponent(data.token)}`;
}

async function processInspection(env: QuestionnaireWorkerBindings, raw: unknown): Promise<void> {
  assertEnvironment(env);
  const message = InspectQuestionnaireMessageSchema.parse(raw);
  const db = dbClient(env);
  const leaseOwner = await leaseJob(db, message);
  if (!leaseOwner) return;

  const { data: artifact, error } = await db
    .from('questionnaire_artifacts')
    .select(
      'id, tenant_id, stored_object_id, source_sha256, format, lifecycle_status, stored_objects!inner(id, storage_bucket, storage_path, status, sha256, malware_scan_status)',
    )
    .eq('tenant_id', message.tenantId)
    .eq('id', message.questionnaireArtifactId)
    .eq('stored_object_id', message.objectId)
    .maybeSingle();
  if (error) throw new Error(`artifact_read_failed:${error.code ?? 'unknown'}`);
  if (!artifact) throw new TerminalQuestionnaireError('artifact_not_found', 'Queued questionnaire artifact was not found in this tenant.');
  const source = Array.isArray(artifact.stored_objects) ? artifact.stored_objects[0] : artifact.stored_objects;
  if (!source || source.status !== 'accepted' || source.sha256 !== artifact.source_sha256) {
    throw new TerminalQuestionnaireError('source_not_accepted', 'Questionnaire source is missing, changed, or no longer accepted.');
  }
  const sourceUrl = await signSource(db, source.storage_bucket, source.storage_path);
  const response = await fetch(`${env.PROCESSOR_URL.replace(/\/$/, '')}/v1/inspect`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.PROCESSOR_INTERNAL_TOKEN}`,
      'content-type': 'application/json',
      'x-correlation-id': message.correlationId,
    },
    body: JSON.stringify({ sourceUrl, sourceSha256: artifact.source_sha256, format: artifact.format }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const code = body?.error?.code ?? `processor_http_${response.status}`;
    if ([400, 401, 413, 422].includes(response.status)) {
      throw new TerminalQuestionnaireError(code, body?.error?.message ?? 'Processor rejected the questionnaire.');
    }
    throw new Error(`${code}:${body?.error?.message ?? 'processor unavailable'}`);
  }
  const manifest = QuestionnaireManifestSchema.parse(await response.json());
  if (manifest.sourceSha256 !== artifact.source_sha256) {
    throw new TerminalQuestionnaireError('manifest_hash_mismatch', 'Processor returned a manifest for different source bytes.');
  }
  const manifestHash = await sha256Hex(JSON.stringify(manifest));
  const { error: completeError } = await db.rpc('complete_questionnaire_import', {
    p_tenant_id: message.tenantId,
    p_questionnaire_artifact_id: message.questionnaireArtifactId,
    p_job_id: message.jobId,
    p_manifest: manifest,
    p_manifest_hash: manifestHash,
  });
  if (completeError) throw new Error(`questionnaire_persist_failed:${completeError.code ?? 'unknown'}:${completeError.message}`);
  await completeJob(db, message, leaseOwner);
}

async function processExport(env: QuestionnaireWorkerBindings, raw: unknown): Promise<void> {
  assertEnvironment(env);
  const message = ExportQuestionnaireMessageSchema.parse(raw);
  const db = dbClient(env);
  const leaseOwner = await leaseJob(db, message);
  if (!leaseOwner) return;

  const { data: run, error: runError } = await db
    .from('questionnaire_export_runs')
    .select(
      'id, tenant_id, export_plan_id, output_object_id, status, questionnaire_export_plans!inner(id, source_sha256, snapshot_hash, answer_snapshot_hash, status, questionnaire_snapshots!inner(id, questionnaire_artifact_id, mapping_version_id, status, questionnaire_artifacts!inner(id, stored_object_id, format, source_sha256, stored_objects!inner(id, storage_bucket, storage_path, status, sha256)))), stored_objects!questionnaire_export_output_fk(id, storage_bucket, storage_path, status)',
    )
    .eq('tenant_id', message.tenantId)
    .eq('id', message.exportRunId)
    .eq('export_plan_id', message.exportPlanId)
    .eq('output_object_id', message.outputObjectId)
    .maybeSingle();
  if (runError) throw new Error(`export_run_read_failed:${runError.code ?? 'unknown'}`);
  if (!run) throw new TerminalQuestionnaireError('export_run_not_found', 'Queued export run was not found in this tenant.');

  const plan = Array.isArray(run.questionnaire_export_plans) ? run.questionnaire_export_plans[0] : run.questionnaire_export_plans;
  const snapshot = plan && (Array.isArray(plan.questionnaire_snapshots) ? plan.questionnaire_snapshots[0] : plan.questionnaire_snapshots);
  const artifact = snapshot && (Array.isArray(snapshot.questionnaire_artifacts) ? snapshot.questionnaire_artifacts[0] : snapshot.questionnaire_artifacts);
  const source = artifact && (Array.isArray(artifact.stored_objects) ? artifact.stored_objects[0] : artifact.stored_objects);
  const output = Array.isArray(run.stored_objects) ? run.stored_objects[0] : run.stored_objects;
  if (!plan || plan.status !== 'executing' || !snapshot || !artifact || !source || !output) {
    throw new TerminalQuestionnaireError('export_identity_invalid', 'Export plan, snapshot, source, or destination is invalid.');
  }
  if (source.status !== 'accepted' || source.sha256 !== plan.source_sha256 || source.sha256 !== artifact.source_sha256) {
    throw new TerminalQuestionnaireError('export_source_changed', 'Source artifact no longer matches the frozen export plan.');
  }
  if (output.status !== 'upload_requested') {
    throw new TerminalQuestionnaireError('export_destination_invalid', 'Export destination is not in the expected pending state.');
  }

  const [{ data: operationRows, error: operationError }, { data: destinationRows, error: destinationError }] = await Promise.all([
    db
      .from('questionnaire_export_operations')
      .select('*')
      .eq('tenant_id', message.tenantId)
      .eq('export_plan_id', message.exportPlanId)
      .order('display_order'),
    db
      .from('questionnaire_answer_destinations')
      .select('*')
      .eq('tenant_id', message.tenantId)
      .eq('mapping_version_id', snapshot.mapping_version_id),
  ]);
  if (operationError || destinationError) throw new Error('Export plan operations could not be loaded.');

  const sourceUrl = await signSource(db, source.storage_bucket, source.storage_path);
  const destinationUploadUrl = await signDestination(db, env.SUPABASE_URL, output.storage_bucket, output.storage_path);
  const processorResponse = await fetch(`${env.PROCESSOR_URL.replace(/\/$/, '')}/v1/export`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.PROCESSOR_INTERNAL_TOKEN}`,
      'content-type': 'application/json',
      'x-correlation-id': message.correlationId,
    },
    body: JSON.stringify({
      sourceUrl,
      destinationUploadUrl,
      sourceSha256: plan.source_sha256,
      format: artifact.format,
      operations: (operationRows ?? []).map((row) => ({
        localId: row.local_id,
        questionLocalId: row.question_local_id,
        destinationLocalId: row.destination_local_id,
        operationType: row.operation_type,
        outwardValue: row.outward_value,
        expectedOriginalValue: row.expected_original_value,
        expectedFormulaState: row.expected_formula_state,
        expectedStyleHash: row.expected_style_hash,
        expectedValidationHash: row.expected_validation_hash,
        conditionActivation: row.condition_activation,
      })),
      destinations: (destinationRows ?? []).map((row) => ({
        localId: row.local_id,
        type: row.destination_type,
        location: row.source_location,
        expectedValueType: row.expected_value_type,
        allowedValues: row.allowed_values,
        storedValues: row.stored_values,
        formulaPresent: row.formula_present,
        protected: row.protected,
        styleHash: row.style_hash,
        validationHash: row.validation_hash,
        writeStrategy: row.write_strategy,
      })),
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!processorResponse.ok) {
    const body = (await processorResponse.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const code = body?.error?.code ?? `processor_http_${processorResponse.status}`;
    if ([400, 401, 413, 422].includes(processorResponse.status)) {
      throw new TerminalQuestionnaireError(code, body?.error?.message ?? 'Processor blocked the export.');
    }
    throw new Error(`${code}:${body?.error?.message ?? 'processor unavailable'}`);
  }
  const result = z
    .object({
      outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
      outputSizeBytes: z.number().int().positive(),
      structuralDiffs: z.array(
        z.object({
          path: z.string(),
          beforeHash: z.string().optional(),
          afterHash: z.string().optional(),
          classification: z.enum(['expected', 'benign_metadata', 'requires_review', 'blocking']),
          reason: z.string(),
        }),
      ),
      changedLocations: z.array(z.string()),
      warnings: z.array(z.string()),
    })
    .parse(await processorResponse.json());

  const { error: completeError } = await db.rpc('complete_questionnaire_export', {
    p_tenant_id: message.tenantId,
    p_export_run_id: message.exportRunId,
    p_output_sha256: result.outputSha256,
    p_output_size_bytes: result.outputSizeBytes,
    p_changed_locations: result.changedLocations,
    p_warnings: result.warnings,
    p_structural_diffs: result.structuralDiffs,
  });
  if (completeError) throw new Error(`export_persist_failed:${completeError.code ?? 'unknown'}:${completeError.message}`);
  await completeJob(db, message, leaseOwner);
}

async function markFailure(
  db: SupabaseClient,
  message: QuestionnaireQueueMessage,
  reason: unknown,
  terminal: boolean,
): Promise<void> {
  const code = reason instanceof TerminalQuestionnaireError ? reason.code : 'questionnaire_worker_failure';
  const detail = reason instanceof Error ? reason.message.slice(0, 500) : 'Unknown questionnaire worker error';
  await db
    .from('jobs')
    .update({
      status: terminal ? 'failed_terminal' : 'failed_retryable',
      last_error_code: code,
      last_error_detail: detail,
      lease_owner: null,
      lease_expires_at: null,
      failed_at: new Date().toISOString(),
    })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId);
  if (message.type === 'export_questionnaire') {
    await db
      .from('questionnaire_export_runs')
      .update({ status: 'failed', last_error_code: code, last_error_detail: detail, completed_at: new Date().toISOString() })
      .eq('tenant_id', message.tenantId)
      .eq('id', message.exportRunId);
    await db
      .from('questionnaire_export_plans')
      .update({ status: terminal ? 'blocked' : 'failed' })
      .eq('tenant_id', message.tenantId)
      .eq('id', message.exportPlanId);
  }
  await db
    .from('audit_events')
    .insert({
      tenant_id: message.tenantId,
      actor_type: 'service',
      action: terminal ? 'questionnaire.processing_failed' : 'questionnaire.processing_retry_scheduled',
      target_type: message.type === 'inspect_questionnaire' ? 'questionnaire_artifact' : 'questionnaire_export_run',
      target_id: message.type === 'inspect_questionnaire' ? message.questionnaireArtifactId : message.exportRunId,
      request_id: message.correlationId,
      metadata: { job_id: message.jobId, error_code: code, operation: message.type },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

async function handleQueue(batch: QueueBatch<unknown>, env: QuestionnaireWorkerBindings): Promise<void> {
  for (const item of batch.messages) {
    let message: QuestionnaireQueueMessage | undefined;
    try {
      message = QuestionnaireQueueMessageSchema.parse(item.body);
      if (message.type === 'inspect_questionnaire') await processInspection(env, message);
      else await processExport(env, message);
      item.ack();
    } catch (error) {
      const terminal = error instanceof TerminalQuestionnaireError || error instanceof z.ZodError || error instanceof SyntaxError;
      if (message) await markFailure(dbClient(env), message, error, terminal);
      if (terminal) item.ack();
      else item.retry({ delaySeconds: retryDelaySeconds(1) });
    }
  }
}

async function dispatchPendingOutbox(env: QuestionnaireWorkerBindings): Promise<void> {
  assertEnvironment(env);
  const db = dbClient(env);
  const { data, error } = await db
    .from('questionnaire_queue_outbox')
    .select('id, tenant_id, payload, dispatch_attempts')
    .is('dispatched_at', null)
    .lte('available_at', new Date().toISOString())
    .order('created_at')
    .limit(50);
  if (error) throw new Error(`outbox_scan_failed:${error.code ?? 'unknown'}`);
  for (const row of data ?? []) {
    try {
      const payload = QuestionnaireQueueMessageSchema.parse(row.payload);
      if (payload.tenantId !== row.tenant_id) throw new TerminalQuestionnaireError('outbox_tenant_mismatch', 'Outbox payload tenant does not match its row.');
      await env.QUESTIONNAIRE_QUEUE.send(payload);
      await db
        .from('questionnaire_queue_outbox')
        .update({
          dispatched_at: new Date().toISOString(),
          dispatch_attempts: row.dispatch_attempts + 1,
          last_error: null,
        })
        .eq('tenant_id', row.tenant_id)
        .eq('id', row.id)
        .is('dispatched_at', null);
    } catch (reason) {
      await db
        .from('questionnaire_queue_outbox')
        .update({
          dispatch_attempts: row.dispatch_attempts + 1,
          available_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: reason instanceof Error ? reason.message.slice(0, 500) : 'dispatch error',
        })
        .eq('tenant_id', row.tenant_id)
        .eq('id', row.id)
        .is('dispatched_at', null);
    }
  }
}

export default {
  async fetch(_request: Request, env: QuestionnaireWorkerBindings): Promise<Response> {
    assertEnvironment(env);
    return Response.json({ status: 'ok', service: 'attestly-questionnaire-worker', environment: env.ENVIRONMENT });
  },
  async queue(batch: QueueBatch<unknown>, env: QuestionnaireWorkerBindings): Promise<void> {
    await handleQueue(batch, env);
  },
  async scheduled(
    _controller: ScheduledController,
    env: QuestionnaireWorkerBindings,
    context: ExecutionContextLike,
  ): Promise<void> {
    context.waitUntil(dispatchPendingOutbox(env));
  },
};
