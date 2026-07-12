import { describe, expect, it } from 'vitest';
import { ExtractEvidenceMessageSchema } from '../../../packages/evidence/src/index';

describe('ingestion queue contract', () => {
  it('rejects cross-shape or unversioned messages', () => {
    expect(() => ExtractEvidenceMessageSchema.parse({ type: 'extract_evidence' })).toThrow();
    expect(
      ExtractEvidenceMessageSchema.parse({
        version: 1,
        type: 'extract_evidence',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        evidenceVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        jobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        correlationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      }).type,
    ).toBe('extract_evidence');
  });
});
