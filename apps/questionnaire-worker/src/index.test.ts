import { describe, expect, it } from 'vitest';
import worker, { type QuestionnaireWorkerBindings } from './index';

const env: QuestionnaireWorkerBindings = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  EXPECTED_SUPABASE_PROJECT_REF: 'local',
  PROCESSOR_URL: 'http://127.0.0.1:8090',
  PROCESSOR_INTERNAL_TOKEN: 'secret',
  ENVIRONMENT: 'development',
  QUESTIONNAIRE_QUEUE: { send: async () => undefined },
};

describe('questionnaire worker', () => {
  it('reports health when environment bindings are coherent', async () => {
    const response = await worker.fetch(new Request('http://worker/health'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', service: 'attestly-questionnaire-worker' });
  });

  it('fails closed when production processor transport is not HTTPS', async () => {
    await expect(
      worker.fetch(new Request('http://worker/health'), { ...env, ENVIRONMENT: 'production' }),
    ).rejects.toThrow('HTTPS');
  });
});
