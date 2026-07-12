import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { ExtractionManifestSchema } from '../../../packages/evidence/src/index';
import { extractDocument } from './extractors';

const RequestSchema = z.object({
  sourceUrl: z.string().url(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().min(1).max(200),
  fileName: z.string().min(1).max(255),
});

const port = Number(process.env.PORT ?? 8090);
const internalToken = process.env.EXTRACTOR_INTERNAL_TOKEN;
const allowedStorageHost = process.env.ALLOWED_STORAGE_HOST;
const allowUnscanned = process.env.ALLOW_UNSCANNED_EXTRACTION === 'true';
const scannerUrl = process.env.MALWARE_SCANNER_URL;

if (!internalToken || internalToken.length < 32) {
  throw new Error('EXTRACTOR_INTERNAL_TOKEN must be at least 32 characters.');
}
if (!allowedStorageHost) throw new Error('ALLOWED_STORAGE_HOST is required.');

async function scan(
  bytes: Uint8Array,
): Promise<'clean' | 'unavailable' | 'suspicious' | 'malware_detected'> {
  if (!scannerUrl) return 'unavailable';
  const url = new URL(scannerUrl);
  if (
    url.protocol !== 'https:' &&
    url.hostname !== '127.0.0.1' &&
    url.hostname !== 'localhost'
  ) {
    throw new Error('scanner_url_not_allowed');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  if (!response.ok) return 'unavailable';
  const result = z
    .object({ status: z.enum(['clean', 'suspicious', 'malware_detected']) })
    .parse(await response.json());
  return result.status;
}

const app = new Hono();
app.get('/health', (c) => c.json({ status: 'ok', service: 'attestly-extractor' }));
app.post('/v1/extract', async (c) => {
  const suppliedToken = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (suppliedToken !== internalToken) {
    return c.json(
      { error: { code: 'unauthorized', message: 'Internal authentication failed.' } },
      401,
    );
  }
  const input = RequestSchema.parse(await c.req.json());
  const source = new URL(input.sourceUrl);
  if (source.protocol !== 'https:' || source.hostname !== allowedStorageHost) {
    return c.json(
      {
        error: {
          code: 'source_url_rejected',
          message: 'The source URL is outside the configured storage boundary.',
        },
      },
      400,
    );
  }

  const response = await fetch(source, {
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    return c.json(
      {
        error: {
          code: 'source_download_failed',
          message: 'The source object could not be downloaded.',
        },
      },
      502,
    );
  }
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (declaredLength > 25 * 1024 * 1024) {
    return c.json(
      {
        error: {
          code: 'source_size_limit',
          message: 'The source object exceeds the extraction limit.',
        },
      },
      413,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) {
    return c.json(
      {
        error: {
          code: 'source_size_limit',
          message: 'The source object exceeds the extraction limit.',
        },
      },
      413,
    );
  }

  const scanStatus = await scan(bytes);
  if (scanStatus === 'malware_detected' || scanStatus === 'suspicious') {
    return c.json(
      {
        error: {
          code: 'malware_blocked',
          message: 'The source object failed security scanning.',
        },
        scanStatus,
      },
      422,
    );
  }
  if (scanStatus === 'unavailable' && !allowUnscanned) {
    return c.json(
      {
        error: {
          code: 'scanner_unavailable',
          message: 'Extraction is blocked until malware scanning succeeds.',
        },
      },
      503,
    );
  }

  const manifest = await extractDocument({
    bytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
    sourceSha256: input.sourceSha256,
    scanStatus,
    startedAt: new Date().toISOString(),
  });
  return c.json(ExtractionManifestSchema.parse(manifest));
});

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      event: 'extractor_error',
      error: error instanceof Error ? error.message : 'unknown',
    }),
  );
  return c.json(
    {
      error: {
        code: 'extraction_failed',
        message: 'The document could not be safely extracted.',
      },
    },
    500,
  );
});

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
