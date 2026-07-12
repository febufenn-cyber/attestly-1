import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import {
  makeAuditEvent,
  retryDelaySeconds,
  ValidateObjectMessageSchema,
  type ValidateObjectMessage,
} from '../../../packages/foundation/src/index';

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

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface WorkerBindings {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EXPECTED_SUPABASE_PROJECT_REF: string;
  STORAGE_BUCKET: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  OBJECT_QUEUE: QueueProducer;
}

class TerminalJobError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TerminalJobError';
  }
}

function serviceClient(env: WorkerBindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertEnvironment(env: WorkerBindings): void {
  const hostname = new URL(env.SUPABASE_URL).hostname;
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== 'local') {
    const actualRef = hostname.split('.')[0];
    if (actualRef !== env.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new TerminalJobError('environment_mismatch', 'Worker is bound to the wrong Supabase project.');
    }
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

export function sniffMime(bytes: Uint8Array): 'application/pdf' | 'application/zip' | 'text/plain' | 'unknown' {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  ) {
    return 'application/zip';
  }

  const sample = bytes.slice(0, 4096);
  if (sample.length === 0) return 'unknown';
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return 'unknown';
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.02 ? 'text/plain' : 'unknown';
}

function declaredTypeMatches(declared: string, detected: ReturnType<typeof sniffMime>): boolean {
  const normalized = declared.toLowerCase().split(';')[0].trim();
  if (normalized === 'application/pdf') return detected === 'application/pdf';
  if (
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalized === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return detected === 'application/zip';
  }
  if (['text/plain', 'text/csv', 'application/csv'].includes(normalized)) {
    return detected === 'text/plain';
  }
  return false;
}

async function appendAudit(
  client: SupabaseClient,
  input: Parameters<typeof makeAuditEvent>[0],
): Promise<void> {
  const { error } = await client.from('audit_events').insert(makeAuditEvent(input));
  if (error) throw new Error(`audit_write_failed:${error.code ?? 'unknown'}`);
}

async function markFailure(
  client: SupabaseClient,
  message: ValidateObjectMessage,
  error: unknown,
  terminal: boolean,
): Promise<void> {
  const code = error instanceof TerminalJobError ? error.code : 'worker_failure';
  const detail = error instanceof Error ? error.message.slice(0, 500) : 'Unknown worker error';
  const jobStatus = terminal ? 'failed_terminal' : 'failed_retryable';

  await client
    .from('jobs')
    .update({
      status: jobStatus,
      last_error_code: code,
      last_error_detail: detail,
      lease_owner: null,
      lease_expires_at: null,
      failed_at: new Date().toISOString(),
    })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId);

  if (terminal) {
    await client
      .from('stored_objects')
      .update({ status: 'validation_failed', validation_error_code: code })
      .eq('tenant_id', message.tenantId)
      .eq('id', message.objectId)
      .in('status', ['uploaded', 'validating']);
  }

  await appendAudit(client, {
    tenantId: message.tenantId,
    actorType: 'service',
    action: terminal ? 'object.validation_failed' : 'object.validation_retry_scheduled',
    targetType: 'stored_object',
    targetId: message.objectId,
    requestId: message.correlationId,
    metadata: { jobId: message.jobId, errorCode: code },
  }).catch(() => undefined);
}

async function processValidation(env: WorkerBindings, rawMessage: unknown): Promise<void> {
  assertEnvironment(env);
  const message = ValidateObjectMessageSchema.parse(rawMessage);
  const client = serviceClient(env);
  const leaseOwner = crypto.randomUUID();

  const { data: leased, error: leaseError } = await client.rpc('lease_job', {
    p_tenant_id: message.tenantId,
    p_job_id: message.jobId,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 120,
  });
  if (leaseError) throw new Error(`lease_failed:${leaseError.code ?? 'unknown'}`);
  if (!leased) return;

  const { error: runningError } = await client
    .from('jobs')
    .update({ status: 'running' })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId)
    .eq('lease_owner', leaseOwner)
    .eq('status', 'leased');
  if (runningError) throw new Error(`job_start_failed:${runningError.code ?? 'unknown'}`);

  const { data: object, error: objectError } = await client
    .from('stored_objects')
    .select('id, tenant_id, storage_bucket, storage_path, declared_mime_type, size_bytes, status')
    .eq('tenant_id', message.tenantId)
    .eq('id', message.objectId)
    .maybeSingle();
  if (objectError) throw new Error(`object_read_failed:${objectError.code ?? 'unknown'}`);
  if (!object) throw new TerminalJobError('object_not_found', 'The queued object does not exist in this tenant.');
  if (object.status === 'accepted') {
    await client
      .from('jobs')
      .update({ status: 'succeeded', completed_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null })
      .eq('tenant_id', message.tenantId)
      .eq('id', message.jobId);
    return;
  }
  if (!['uploaded', 'validating'].includes(object.status)) {
    throw new TerminalJobError('invalid_object_state', `Object cannot be validated from state ${object.status}.`);
  }
  if (object.size_bytes > 25 * 1024 * 1024) {
    throw new TerminalJobError('file_too_large', 'The object exceeds the Phase 2 upload limit.');
  }

  await client
    .from('stored_objects')
    .update({ status: 'validating' })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.objectId)
    .in('status', ['uploaded', 'validating']);

  const { data: blob, error: downloadError } = await client.storage
    .from(object.storage_bucket)
    .download(object.storage_path);
  if (downloadError || !blob) throw new Error(`storage_download_failed:${downloadError?.message ?? 'empty'}`);

  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength !== object.size_bytes) {
    throw new TerminalJobError('size_mismatch', 'Uploaded bytes do not match the declared size.');
  }
  const detected = sniffMime(new Uint8Array(buffer));
  if (!declaredTypeMatches(object.declared_mime_type, detected)) {
    throw new TerminalJobError(
      'mime_mismatch',
      `Declared type ${object.declared_mime_type} does not match detected type ${detected}.`,
    );
  }

  const hash = await sha256(buffer);
  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from('stored_objects')
    .update({
      status: 'accepted',
      detected_mime_type: detected,
      sha256: hash,
      validated_at: now,
      validation_error_code: null,
    })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.objectId)
    .eq('status', 'validating');
  if (updateError) throw new Error(`object_update_failed:${updateError.code ?? 'unknown'}`);

  const { error: jobError } = await client
    .from('jobs')
    .update({
      status: 'succeeded',
      completed_at: now,
      lease_owner: null,
      lease_expires_at: null,
      last_error_code: null,
      last_error_detail: null,
    })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId)
    .eq('lease_owner', leaseOwner);
  if (jobError) throw new Error(`job_update_failed:${jobError.code ?? 'unknown'}`);

  await appendAudit(client, {
    tenantId: message.tenantId,
    actorType: 'service',
    action: 'object.validation_succeeded',
    targetType: 'stored_object',
    targetId: message.objectId,
    requestId: message.correlationId,
    metadata: { jobId: message.jobId, sha256: hash, detectedMimeType: detected },
  });
}

async function handleQueue(batch: QueueBatch<unknown>, env: WorkerBindings): Promise<void> {
  for (const item of batch.messages) {
    let parsed: ValidateObjectMessage | undefined;
    try {
      parsed = ValidateObjectMessageSchema.parse(item.body);
      await processValidation(env, parsed);
      item.ack();
    } catch (error) {
      const terminal = error instanceof TerminalJobError || error instanceof ZodError || error instanceof SyntaxError;
      if (parsed) await markFailure(serviceClient(env), parsed, error, terminal);
      if (terminal) item.ack();
      else item.retry({ delaySeconds: retryDelaySeconds(1) });
    }
  }
}

async function dispatchPendingOutbox(env: WorkerBindings): Promise<void> {
  assertEnvironment(env);
  const client = serviceClient(env);
  const { data, error } = await client
    .from('queue_outbox')
    .select('id, tenant_id, payload, dispatch_attempts')
    .is('dispatched_at', null)
    .lte('available_at', new Date().toISOString())
    .order('created_at')
    .limit(50);
  if (error) throw new Error(`outbox_scan_failed:${error.code ?? 'unknown'}`);

  for (const row of data ?? []) {
    try {
      const payload = ValidateObjectMessageSchema.parse(row.payload);
      if (payload.tenantId !== row.tenant_id) {
        throw new TerminalJobError('outbox_tenant_mismatch', 'Outbox payload tenant does not match its row.');
      }
      await env.OBJECT_QUEUE.send(payload);
      await client
        .from('queue_outbox')
        .update({
          dispatched_at: new Date().toISOString(),
          dispatch_attempts: row.dispatch_attempts + 1,
          last_error: null,
        })
        .eq('tenant_id', row.tenant_id)
        .eq('id', row.id)
        .is('dispatched_at', null);
    } catch (dispatchError) {
      await client
        .from('queue_outbox')
        .update({
          dispatch_attempts: row.dispatch_attempts + 1,
          available_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: dispatchError instanceof Error ? dispatchError.message.slice(0, 500) : 'dispatch error',
        })
        .eq('tenant_id', row.tenant_id)
        .eq('id', row.id)
        .is('dispatched_at', null);
    }
  }
}

export default {
  async fetch(_request: Request, env: WorkerBindings): Promise<Response> {
    assertEnvironment(env);
    return Response.json({ status: 'ok', service: 'attestly-object-worker', environment: env.ENVIRONMENT });
  },
  async queue(batch: QueueBatch<unknown>, env: WorkerBindings): Promise<void> {
    await handleQueue(batch, env);
  },
  async scheduled(
    _controller: ScheduledController,
    env: WorkerBindings,
    context: ExecutionContextLike,
  ): Promise<void> {
    context.waitUntil(dispatchPendingOutbox(env));
  },
};
