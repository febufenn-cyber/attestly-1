import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  DraftAnswerSchema,
  GenerationInputSchema,
  generationInputHash,
  type EvidenceCandidate,
  type GenerationInput,
} from '../../../packages/answer/src/index';
import {
  GenerateAnswerMessageSchema,
  type GenerateAnswerMessage,
} from '../../../packages/answer/src/contracts';
import {
  ProviderError,
  blockedDraftForProviderFailure,
  createModelProvider,
  materializeProviderDraft,
} from '../../../packages/answer/src/provider';
import { retryDelaySeconds } from '../../../packages/foundation/src/index';

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

export interface GenerationWorkerBindings {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EXPECTED_SUPABASE_PROJECT_REF: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_ENDPOINT?: string;
  GENERATION_TIMEOUT_MS?: string;
  GENERATION_INPUT_COST_MICRO_USD_PER_MILLION_TOKENS?: string;
  GENERATION_OUTPUT_COST_MICRO_USD_PER_MILLION_TOKENS?: string;
  GENERATION_QUEUE: QueueProducer;
}

class TerminalGenerationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function dbClient(env: GenerationWorkerBindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertEnvironment(env: GenerationWorkerBindings): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EXPECTED_SUPABASE_PROJECT_REF',
  ] as const;
  for (const key of required) {
    if (!env[key])
      throw new TerminalGenerationError('environment_invalid', `Missing binding: ${key}`);
  }
  if (env.EXPECTED_SUPABASE_PROJECT_REF !== 'local') {
    const actual = new URL(env.SUPABASE_URL).hostname.split('.')[0];
    if (actual !== env.EXPECTED_SUPABASE_PROJECT_REF) {
      throw new TerminalGenerationError(
        'environment_mismatch',
        'Worker is bound to the wrong Supabase project.',
      );
    }
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function leaseJob(
  db: SupabaseClient,
  message: GenerateAnswerMessage,
): Promise<string | undefined> {
  const leaseOwner = crypto.randomUUID();
  const { data, error } = await db.rpc('lease_job', {
    p_tenant_id: message.tenantId,
    p_job_id: message.jobId,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 900,
  });
  if (error) throw new Error(`lease_failed:${error.code ?? 'unknown'}`);
  if (!data) return undefined;
  return leaseOwner;
}

async function generationContext(db: SupabaseClient, message: GenerateAnswerMessage) {
  const { data: run, error: runError } = await db
    .from('generation_runs')
    .select(
      'id, tenant_id, questionnaire_snapshot_id, mapping_version_id, question_id, job_id, operation, status, snapshot_hash, requested_scope, provider, model, model_version, prompt_version, schema_version, requested_by',
    )
    .eq('tenant_id', message.tenantId)
    .eq('id', message.generationRunId)
    .eq('job_id', message.jobId)
    .eq('questionnaire_snapshot_id', message.questionnaireSnapshotId)
    .eq('question_id', message.questionId)
    .maybeSingle();
  if (runError) throw new Error(`generation_read_failed:${runError.code ?? 'unknown'}`);
  if (!run)
    throw new TerminalGenerationError(
      'generation_not_found',
      'Queued generation run was not found in this tenant.',
    );
  if (['succeeded', 'blocked', 'failed_terminal', 'cancelled'].includes(run.status))
    return { terminal: true as const, run };
  const [{ data: question, error: questionError }, { data: atomicRequests, error: atomicError }] =
    await Promise.all([
      db
        .from('questionnaire_questions')
        .select(
          'id, local_id, original_text, normalized_text, question_type, polarity, answer_format, source_location',
        )
        .eq('tenant_id', message.tenantId)
        .eq('id', message.questionId)
        .eq('mapping_version_id', run.mapping_version_id)
        .maybeSingle(),
      db
        .from('questionnaire_atomic_requests')
        .select('local_id, sequence, original_clause, normalized_claim, qualifiers, materiality')
        .eq('tenant_id', message.tenantId)
        .eq('mapping_version_id', run.mapping_version_id)
        .order('sequence'),
    ]);
  if (questionError || atomicError) throw new Error('generation_question_read_failed');
  if (!question || !atomicRequests?.length)
    throw new TerminalGenerationError(
      'generation_question_invalid',
      'Frozen question or atomic claims are missing.',
    );
  return { terminal: false as const, run, question, atomicRequests };
}

function retrievalQuery(
  question: { normalized_text: string },
  atomicRequests: Array<{ normalized_claim: string }>,
) {
  return [question.normalized_text, ...atomicRequests.map((item) => item.normalized_claim)]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10_000);
}

function candidateFromRow(row: Record<string, unknown>): EvidenceCandidate {
  return {
    spanId: String(row.span_id),
    evidenceVersionId: String(row.evidence_version_id),
    documentTitle: String(row.document_title),
    versionLabel: String(row.version_label),
    text: String(row.text_content),
    normalizedText: String(row.normalized_text),
    pageNumber: row.page_number === null ? null : Number(row.page_number),
    sheetName: row.sheet_name === null ? null : String(row.sheet_name),
    cellRange: row.cell_range === null ? null : String(row.cell_range),
    headingPath: Array.isArray(row.heading_path) ? row.heading_path.map(String) : [],
    evidenceClass: row.evidence_class as EvidenceCandidate['evidenceClass'],
    disclosurePolicy: row.disclosure_policy as EvidenceCandidate['disclosurePolicy'],
    scopeMatch: row.scope_match as EvidenceCandidate['scopeMatch'],
    authorityScore: Number(row.authority_score),
    freshnessScore: Number(row.freshness_score),
    extractionQuality: Number(row.extraction_quality),
    retrievalScore: Number(row.final_rank),
    historical: Boolean(row.historical),
    contradiction: Number(row.contradiction_count ?? 0) > 0,
    contradictionSummary:
      Number(row.contradiction_count ?? 0) > 0
        ? 'Approved evidence relations indicate a contradiction involving this evidence version.'
        : null,
  };
}

function generationInput(
  context: Exclude<Awaited<ReturnType<typeof generationContext>>, { terminal: true }>,
  message: GenerateAnswerMessage,
  candidates: EvidenceCandidate[],
): GenerationInput {
  return GenerationInputSchema.parse({
    schemaVersion: 1,
    tenantId: message.tenantId,
    questionnaireSnapshotId: message.questionnaireSnapshotId,
    snapshotHash: context.run.snapshot_hash,
    generationRunId: message.generationRunId,
    operation: context.run.operation,
    requestedScope: context.run.requested_scope,
    question: {
      questionId: context.question.id,
      originalText: context.question.original_text,
      normalizedText: context.question.normalized_text,
      questionType: context.question.question_type,
      polarity: context.question.polarity,
      answerFormat: context.question.answer_format,
      sourceLocation: context.question.source_location,
      atomicRequests: context.atomicRequests.map((request) => ({
        localId: request.local_id,
        sequence: request.sequence,
        originalClause: request.original_clause,
        normalizedClaim: request.normalized_claim,
        qualifiers: request.qualifiers ?? [],
        materiality: request.materiality,
      })),
    },
    candidates,
    model: {
      provider: context.run.provider,
      model: context.run.model,
      modelVersion: context.run.model_version,
      promptVersion: context.run.prompt_version,
      schemaVersion: 1,
    },
  });
}

async function recordUsage(
  db: SupabaseClient,
  message: GenerateAnswerMessage,
  usage: unknown,
): Promise<void> {
  const { error } = await db.rpc('record_generation_usage', {
    p_tenant_id: message.tenantId,
    p_generation_run_id: message.generationRunId,
    p_usage: usage,
  });
  if (error) throw new Error(`generation_usage_failed:${error.code ?? 'unknown'}`);
}

async function completeGeneration(
  db: SupabaseClient,
  message: GenerateAnswerMessage,
  draft: unknown,
): Promise<void> {
  const parsed = DraftAnswerSchema.parse(draft);
  const { error } = await db.rpc('complete_generation_run', {
    p_tenant_id: message.tenantId,
    p_generation_run_id: message.generationRunId,
    p_draft: parsed,
    p_output_hash: sha256Json(parsed),
  });
  if (error)
    throw new Error(`generation_complete_failed:${error.code ?? 'unknown'}:${error.message}`);
}

async function failGeneration(
  db: SupabaseClient,
  message: GenerateAnswerMessage,
  code: string,
  detail: string,
  retryable: boolean,
): Promise<void> {
  const { error } = await db.rpc('fail_generation_run', {
    p_tenant_id: message.tenantId,
    p_generation_run_id: message.generationRunId,
    p_error_code: code,
    p_error_detail: detail.slice(0, 1_000),
    p_retryable: retryable,
  });
  if (error) throw new Error(`generation_failure_persist_failed:${error.code ?? 'unknown'}`);
}

async function processGeneration(
  env: GenerationWorkerBindings,
  raw: unknown,
  queueMessage: QueueMessage<unknown>,
): Promise<void> {
  assertEnvironment(env);
  const message = GenerateAnswerMessageSchema.parse(raw);
  const db = dbClient(env);
  const context = await generationContext(db, message);
  if (context.terminal) {
    queueMessage.ack();
    return;
  }
  const leaseOwner = await leaseJob(db, message);
  if (!leaseOwner) {
    const refreshed = await generationContext(db, message);
    if (refreshed.terminal) queueMessage.ack();
    else queueMessage.retry({ delaySeconds: 30 });
    return;
  }
  const { data: job } = await db
    .from('jobs')
    .select('attempt_count, max_attempts')
    .eq('tenant_id', message.tenantId)
    .eq('id', message.jobId)
    .eq('lease_owner', leaseOwner)
    .maybeSingle();
  const attempt = Math.max(1, Number(job?.attempt_count ?? 1));
  const maxAttempts = Math.max(1, Number(job?.max_attempts ?? 3));

  let input: GenerationInput | undefined;
  try {
    const query = retrievalQuery(context.question, context.atomicRequests);
    const { data: candidateRows, error: retrievalError } = await db.rpc(
      'search_evidence_for_generation',
      {
        p_tenant_id: message.tenantId,
        p_generation_run_id: message.generationRunId,
        p_query: query,
        p_limit: 12,
      },
    );
    if (retrievalError)
      throw new Error(
        `generation_retrieval_failed:${retrievalError.code ?? 'unknown'}:${retrievalError.message}`,
      );
    const candidates = (candidateRows ?? []).map((row: Record<string, unknown>) =>
      candidateFromRow(row),
    );
    input = generationInput(context, message, candidates);
    const inputHash = generationInputHash(input);
    const immutableCandidates = candidates.map((candidate, index) => ({
      ...candidate,
      retrievalRunId: (candidateRows?.[index] as Record<string, unknown> | undefined)
        ?.retrieval_run_id,
      candidateOrder: index + 1,
    }));
    const { error: persistError } = await db.rpc('persist_generation_input', {
      p_tenant_id: message.tenantId,
      p_generation_run_id: message.generationRunId,
      p_input_hash: inputHash,
      p_input_snapshot: input,
      p_candidates: immutableCandidates,
    });
    if (persistError)
      throw new TerminalGenerationError(
        'generation_input_persist_failed',
        `${persistError.code ?? 'unknown'}:${persistError.message}`,
      );

    const provider = createModelProvider({
      provider: context.run.provider,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      model: context.run.model,
      endpoint: env.ANTHROPIC_ENDPOINT,
      inputCostMicroUsdPerMillionTokens: positiveInteger(
        env.GENERATION_INPUT_COST_MICRO_USD_PER_MILLION_TOKENS,
        0,
      ),
      outputCostMicroUsdPerMillionTokens: positiveInteger(
        env.GENERATION_OUTPUT_COST_MICRO_USD_PER_MILLION_TOKENS,
        0,
      ),
    });
    const timeoutMs = positiveInteger(env.GENERATION_TIMEOUT_MS, 60_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await provider.generate(input, attempt, controller.signal);
      await recordUsage(db, message, result.usage);
      const draft = materializeProviderDraft(input, result.output);
      await completeGeneration(db, message, draft);
      queueMessage.ack();
    } finally {
      clearTimeout(timeout);
    }
  } catch (reason) {
    const providerError = reason instanceof ProviderError ? reason : undefined;
    const terminalError = reason instanceof TerminalGenerationError ? reason : undefined;
    const schemaError = reason instanceof z.ZodError;
    const code =
      providerError?.code ??
      terminalError?.code ??
      (schemaError ? 'provider_output_invalid' : 'generation_runtime_failure');
    const detail = reason instanceof Error ? reason.message : 'Unknown generation failure.';
    const retryable =
      providerError?.retryable ?? (!terminalError && !schemaError && attempt < maxAttempts);
    if (!retryable && input) {
      const blocked = blockedDraftForProviderFailure(input, code, detail);
      await completeGeneration(db, message, blocked);
      queueMessage.ack();
      return;
    }
    await failGeneration(db, message, code, detail, retryable);
    if (retryable && attempt < maxAttempts)
      queueMessage.retry({ delaySeconds: retryDelaySeconds(attempt) });
    else queueMessage.ack();
  }
}

async function recoverOutbox(env: GenerationWorkerBindings): Promise<void> {
  assertEnvironment(env);
  const db = dbClient(env);
  const { data, error } = await db
    .from('generation_queue_outbox')
    .select('id, tenant_id, payload, dispatch_attempts')
    .is('dispatched_at', null)
    .lte('available_at', new Date().toISOString())
    .order('created_at')
    .limit(100);
  if (error) throw new Error(`generation_outbox_read_failed:${error.code ?? 'unknown'}`);
  for (const row of data ?? []) {
    try {
      const payload = GenerateAnswerMessageSchema.parse(row.payload);
      await env.GENERATION_QUEUE.send(payload);
      await db
        .from('generation_queue_outbox')
        .update({
          dispatched_at: new Date().toISOString(),
          dispatch_attempts: (row.dispatch_attempts ?? 0) + 1,
          last_error: null,
        })
        .eq('tenant_id', row.tenant_id)
        .eq('id', row.id)
        .is('dispatched_at', null);
    } catch (reason) {
      await db
        .from('generation_queue_outbox')
        .update({
          dispatch_attempts: (row.dispatch_attempts ?? 0) + 1,
          last_error: reason instanceof Error ? reason.message.slice(0, 500) : 'queue error',
        })
        .eq('tenant_id', row.tenant_id)
        .eq('id', row.id);
    }
  }
}

export default {
  async queue(batch: QueueBatch<unknown>, env: GenerationWorkerBindings): Promise<void> {
    for (const message of batch.messages) await processGeneration(env, message.body, message);
  },
  async scheduled(
    _controller: ScheduledController,
    env: GenerationWorkerBindings,
    ctx: ExecutionContextLike,
  ): Promise<void> {
    ctx.waitUntil(recoverOutbox(env));
  },
};
