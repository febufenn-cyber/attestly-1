import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildEvidenceSpans,
  ExtractEvidenceMessageSchema,
  ExtractionManifestSchema,
  retryDelaySeconds,
  sha256Hex,
  type ExtractEvidenceMessage,
} from '../../../packages/evidence/src/index';

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

export interface IngestionBindings {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EXPECTED_SUPABASE_PROJECT_REF: string;
  STORAGE_BUCKET: string;
  EXTRACTOR_URL: string;
  EXTRACTOR_INTERNAL_TOKEN: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  EXTRACTION_QUEUE: QueueProducer;
}

class TerminalIngestionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function client(env: IngestionBindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertEnvironment(env: IngestionBindings): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EXPECTED_SUPABASE_PROJECT_REF',
    'EXTRACTOR_URL',
    'EXTRACTOR_INTERNAL_TOKEN',
  ] as const;
  for (const key of required) {
    if (!env[key]) {
      throw new TerminalIngestionError('environment_invalid', `Missing binding: ${key}`);
    }
  }
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== 'local') {
    const actual = new URL(env.SUPABASE_URL).hostname.split('.')[0];
    if (actual !== env.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new TerminalIngestionError(
        'environment_mismatch',
        'Worker is bound to the wrong Supabase project.',
      );
    }
  }
  const extractor = new URL(env.EXTRACTOR_URL);
  if (env.ENVIRONMENT === 'production' && extractor.protocol !== 'https:') {
    throw new TerminalIngestionError(
      'extractor_transport_invalid',
      'Production extractor traffic must use HTTPS.',
    );
  }
}

async function markFailure(
  db: SupabaseClient,
  message: ExtractEvidenceMessage,
  reason: unknown,
  terminal: boolean,
): Promise<void> {
  const code =
    reason instanceof TerminalIngestionError ? reason.code : 'extraction_worker_failure';
  const detail = reason instanceof Error ? reason.message.slice(0, 500) : 'Unknown extraction error';
  const status = terminal ? 'failed_terminal' : 'failed_retryable';
  await db
    .from('jobs')
    .update({
      status,
      last_error_code: code,
      last_error_detail: detail,
      lease_owner: null,
      lease_expires_at: null,
      failed_at: new Date().toISOString(),
    })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId);
  await db
    .from('evidence_versions')
    .update({ extraction_status: status })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.evidenceVersionId);
  await db
    .from('audit_events')
    .insert({
      tenant_id: message.tenantId,
      actor_type: 'service',
      action: terminal
        ? 'evidence.extraction_failed'
        : 'evidence.extraction_retry_scheduled',
      target_type: 'evidence_version',
      target_id: message.evidenceVersionId,
      request_id: message.correlationId,
      metadata: { job_id: message.jobId, error_code: code },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

async function processExtraction(env: IngestionBindings, raw: unknown): Promise<void> {
  assertEnvironment(env);
  const message = ExtractEvidenceMessageSchema.parse(raw);
  const db = client(env);
  const leaseOwner = crypto.randomUUID();
  const { data: leased, error: leaseError } = await db.rpc('lease_job', {
    p_tenant_id: message.tenantId,
    p_job_id: message.jobId,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 900,
  });
  if (leaseError) throw new Error(`lease_failed:${leaseError.code ?? 'unknown'}`);
  if (!leased) return;

  await db
    .from('jobs')
    .update({ status: 'running' })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId)
    .eq('lease_owner', leaseOwner)
    .eq('status', 'leased');
  await db
    .from('evidence_versions')
    .update({ extraction_status: 'running' })
    .eq('tenant_id', message.tenantId)
    .eq('id', message.evidenceVersionId);

  const { data: version, error: versionError } = await db
    .from('evidence_versions')
    .select(
      'id, tenant_id, stored_object_id, source_sha256, extraction_status, lifecycle_status, stored_objects!inner(id, storage_bucket, storage_path, file_name, declared_mime_type, detected_mime_type, size_bytes, status, sha256)',
    )
    .eq('tenant_id', message.tenantId)
    .eq('id', message.evidenceVersionId)
    .eq('stored_object_id', message.objectId)
    .maybeSingle();
  if (versionError) {
    throw new Error(`version_read_failed:${versionError.code ?? 'unknown'}`);
  }
  if (!version) {
    throw new TerminalIngestionError(
      'evidence_version_not_found',
      'Evidence version does not belong to the queued tenant and object.',
    );
  }
  const source = Array.isArray(version.stored_objects)
    ? version.stored_objects[0]
    : version.stored_objects;
  if (!source || source.status !== 'accepted' || source.sha256 !== version.source_sha256) {
    throw new TerminalIngestionError(
      'source_not_accepted',
      'The immutable source object is missing, changed, or no longer accepted.',
    );
  }

  const { data: signed, error: signedError } = await db.storage
    .from(source.storage_bucket)
    .createSignedUrl(source.storage_path, 300);
  if (signedError || !signed?.signedUrl) {
    throw new Error(`source_sign_failed:${signedError?.message ?? 'unknown'}`);
  }

  const extractorResponse = await fetch(
    `${env.EXTRACTOR_URL.replace(/\/$/, '')}/v1/extract`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.EXTRACTOR_INTERNAL_TOKEN}`,
        'content-type': 'application/json',
        'x-correlation-id': message.correlationId,
      },
      body: JSON.stringify({
        sourceUrl: signed.signedUrl,
        sourceSha256: version.source_sha256,
        mimeType: source.detected_mime_type ?? source.declared_mime_type,
        fileName: source.file_name,
      }),
      signal: AbortSignal.timeout(180_000),
    },
  );

  if (!extractorResponse.ok) {
    const body = (await extractorResponse.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    const code = body?.error?.code ?? `extractor_http_${extractorResponse.status}`;
    if ([400, 401, 413, 422].includes(extractorResponse.status)) {
      throw new TerminalIngestionError(
        code,
        body?.error?.message ?? 'Extractor rejected the source.',
      );
    }
    throw new Error(`${code}:${body?.error?.message ?? 'extractor unavailable'}`);
  }

  const manifest = ExtractionManifestSchema.parse(await extractorResponse.json());
  if (manifest.sourceSha256 !== version.source_sha256) {
    throw new TerminalIngestionError(
      'manifest_hash_mismatch',
      'Extractor returned a manifest for different source bytes.',
    );
  }
  const spans = await buildEvidenceSpans(manifest.nodes);
  if (spans.length === 0) {
    throw new TerminalIngestionError(
      'no_citable_spans',
      'Extraction produced no citable evidence spans.',
    );
  }
  const manifestHash = await sha256Hex(JSON.stringify(manifest));

  const { error: completeError } = await db.rpc('complete_evidence_extraction', {
    p_tenant_id: message.tenantId,
    p_evidence_version_id: message.evidenceVersionId,
    p_job_id: message.jobId,
    p_manifest: manifest,
    p_spans: spans,
    p_manifest_hash: manifestHash,
  });
  if (completeError) {
    throw new Error(
      `extraction_persist_failed:${completeError.code ?? 'unknown'}:${completeError.message}`,
    );
  }

  const now = new Date().toISOString();
  const { error: jobError } = await db
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
  if (jobError) throw new Error(`job_complete_failed:${jobError.code ?? 'unknown'}`);
}

async function handleQueue(
  batch: QueueBatch<unknown>,
  env: IngestionBindings,
): Promise<void> {
  for (const item of batch.messages) {
    let message: ExtractEvidenceMessage | undefined;
    try {
      message = ExtractEvidenceMessageSchema.parse(item.body);
      await processExtraction(env, message);
      item.ack();
    } catch (reason) {
      const terminal =
        reason instanceof TerminalIngestionError ||
        (reason instanceof Error && reason.name === 'ZodError');
      if (message) await markFailure(client(env), message, reason, terminal);
      if (terminal) item.ack();
      else item.retry({ delaySeconds: retryDelaySeconds(1) });
    }
  }
}

async function dispatchPending(env: IngestionBindings): Promise<void> {
  assertEnvironment(env);
  const db = client(env);
  const { data, error } = await db
    .from('evidence_queue_outbox')
    .select('id, tenant_id, payload, dispatch_attempts')
    .is('dispatched_at', null)
    .lte('available_at', new Date().toISOString())
    .order('created_at')
    .limit(50);
  if (error) throw new Error(`outbox_scan_failed:${error.code ?? 'unknown'}`);
  for (const row of data ?? []) {
    try {
      const payload = ExtractEvidenceMessageSchema.parse(row.payload);
      if (payload.tenantId !== row.tenant_id) {
        throw new TerminalIngestionError(
          'outbox_tenant_mismatch',
          'Outbox payload tenant mismatch.',
        );
      }
      await env.EXTRACTION_QUEUE.send(payload);
      await db
        .from('evidence_queue_outbox')
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
        .from('evidence_queue_outbox')
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
  async fetch(_request: Request, env: IngestionBindings): Promise<Response> {
    assertEnvironment(env);
    return Response.json({
      status: 'ok',
      service: 'attestly-ingestion',
      environment: env.ENVIRONMENT,
    });
  },
  async queue(batch: QueueBatch<unknown>, env: IngestionBindings): Promise<void> {
    await handleQueue(batch, env);
  },
  async scheduled(
    _controller: ScheduledController,
    env: IngestionBindings,
    context: ExecutionContextLike,
  ): Promise<void> {
    context.waitUntil(dispatchPending(env));
  },
};
