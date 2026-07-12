import { describe, expect, it } from 'vitest';
import { sniffMime } from './index';

describe('file type detection', () => {
  it('detects PDF, ZIP-based Office files, and text without trusting extensions', () => {
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
    expect(sniffMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('application/zip');
    expect(sniffMime(new TextEncoder().encode('security policy\nversion 1'))).toBe('text/plain');
    expect(sniffMime(new Uint8Array([0, 1, 2, 3]))).toBe('unknown');
  });
});
