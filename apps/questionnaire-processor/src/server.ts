import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  AnswerDestinationSchema,
  ExportOperationSchema,
  QuestionnaireFormatSchema,
  QuestionnaireManifestSchema,
} from '../../../packages/questionnaire/src/index';
import { exportQuestionnaire, inspectQuestionnaire } from './processor';

const InspectRequestSchema = z.object({
  sourceUrl: z.string().url(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: QuestionnaireFormatSchema,
});

const ExportRequestSchema = z.object({
  sourceUrl: z.string().url(),
  destinationUploadUrl: z.string().url(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: QuestionnaireFormatSchema,
  operations: z.array(ExportOperationSchema).max(20_000),
  destinations: z.array(AnswerDestinationSchema).max(20_000),
});

const app = new Hono();
const port = Number(process.env.PORT ?? 8090);
const internalToken = process.env.PROCESSOR_INTERNAL_TOKEN;
const allowedHosts = new Set(
  (process.env.ALLOWED_STORAGE_HOSTS ?? '127.0.0.1,localhost')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

function authorize(header: string | undefined): void {
  if (!internalToken || header !== `Bearer ${internalToken}`) throw new Error('Unauthorized processor request.');
}

function validateStorageUrl(value: string): URL {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!local && url.protocol !== 'https:') throw new Error('Production processor URLs must use HTTPS.');
  if (!allowedHosts.has(url.hostname.toLowerCase())) throw new Error('Storage hostname is not allowlisted.');
  return url;
}

async function download(urlValue: string): Promise<ArrayBuffer> {
  const url = validateStorageUrl(urlValue);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Source download failed with ${response.status}.`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 25 * 1024 * 1024) throw new Error('Source exceeds the processor size limit.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('Source exceeds the processor size limit.');
  return bytes;
}

async function upload(urlValue: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  const url = validateStorageUrl(urlValue);
  let lastStatus = 0;
  for (const method of ['PUT', 'POST'] as const) {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': contentType, 'x-upsert': 'false' },
      body: new Uint8Array(bytes),
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
    if (response.ok) return;
    lastStatus = response.status;
    if (![404, 405].includes(response.status)) break;
  }
  throw new Error(`Destination upload failed with ${lastStatus}.`);
}

app.get('/health', (context) => context.json({ status: 'ok', service: 'attestly-questionnaire-processor' }));

app.post('/v1/inspect', async (context) => {
  try {
    authorize(context.req.header('authorization'));
    const input = InspectRequestSchema.parse(await context.req.json());
    const source = await download(input.sourceUrl);
    const manifest = await inspectQuestionnaire(source, input.format, input.sourceSha256);
    return context.json(QuestionnaireManifestSchema.parse(manifest));
  } catch (error) {
    const validation = error instanceof z.ZodError;
    return context.json(
      {
        error: {
          code: validation ? 'validation_failed' : 'processor_failed',
          message: validation ? 'Processor request did not match the expected schema.' : error instanceof Error ? error.message : 'Processor failed.',
          ...(validation ? { details: error.flatten() } : {}),
        },
      },
      validation ? 400 : 422,
    );
  }
});

app.post('/v1/export', async (context) => {
  try {
    authorize(context.req.header('authorization'));
    const input = ExportRequestSchema.parse(await context.req.json());
    const source = await download(input.sourceUrl);
    const result = await exportQuestionnaire(source, input);
    const contentType = input.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
    await upload(input.destinationUploadUrl, result.output, contentType);
    return context.json({
      outputSha256: result.outputSha256,
      outputSizeBytes: result.output.byteLength,
      structuralDiffs: result.structuralDiffs,
      changedLocations: result.changedLocations,
      warnings: result.warnings,
    });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    return context.json(
      {
        error: {
          code: validation ? 'validation_failed' : 'export_failed',
          message: validation ? 'Export request did not match the expected schema.' : error instanceof Error ? error.message : 'Export failed.',
          ...(validation ? { details: error.flatten() } : {}),
        },
      },
      validation ? 400 : 422,
    );
  }
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Questionnaire processor listening on ${info.port}`);
});
