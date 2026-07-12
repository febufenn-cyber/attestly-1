import { describe, expect, it } from 'vitest';
import { app } from './index';

const env = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  EXPECTED_SUPABASE_PROJECT_REF: 'local',
  ALLOWED_ORIGIN: 'http://127.0.0.1:5174',
  ENVIRONMENT: 'development' as const,
  EXTRACTION_QUEUE: { send: async () => undefined },
};

describe('evidence API boundary', () => {
  it('serves health without authentication', async () => {
    const response = await app.request('/health', {}, env);
    expect(response.status).toBe(200);
  });

  it('rejects protected routes without a bearer token', async () => {
    const response = await app.request('/v1/workspaces', {}, env);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });
});
