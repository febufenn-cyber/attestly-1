import { describe, expect, it } from 'vitest';
import {
  can,
  canTransitionJob,
  CreateOrganizationInputSchema,
  redactMetadata,
  retryDelaySeconds,
} from './index';

describe('authorization', () => {
  it('does not allow contributors to manage members', () => {
    expect(can('contributor', 'member.invite')).toBe(false);
    expect(can('admin', 'member.invite')).toBe(true);
  });
});

describe('job state machine', () => {
  it('allows retryable work to be leased again but never reopens success', () => {
    expect(canTransitionJob('failed_retryable', 'leased')).toBe(true);
    expect(canTransitionJob('succeeded', 'running')).toBe(false);
    expect(retryDelaySeconds(20)).toBe(1280);
  });
});

describe('contracts and redaction', () => {
  it('rejects unsafe slugs and redacts nested secrets', () => {
    expect(() => CreateOrganizationInputSchema.parse({ name: 'Acme', slug: 'Acme Corp' })).toThrow();
    expect(
      redactMetadata({ nested: { authorization: 'Bearer abc', safe: 'kept' } }),
    ).toEqual({ nested: { authorization: '[redacted]', safe: 'kept' } });
  });
});
