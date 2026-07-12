import { describe, expect, it } from 'vitest';
import { app, type Bindings } from './index';

const env: Bindings = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  EXPECTED_SUPABASE_PROJECT_REF: 'local',
  WEB_BASE_URL: 'http://127.0.0.1:5173',
  ALLOWED_ORIGIN: 'http://127.0.0.1:5173',
  STORAGE_BUCKET: 'attestly-evidence',
  ENVIRONMENT: 'local',
  OBJECT_QUEUE: { send: async () => undefined },
};

describe('api boundary', () => {
  it('returns a health response without authentication', async () => {
    const response = await app.request('/health', {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', service: 'attestly-api' });
  });

  it('rejects protected routes without a token and returns a request id', async () => {
    const response = await app.request('/v1/me/workspaces', {}, env);
    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(await response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });
});
