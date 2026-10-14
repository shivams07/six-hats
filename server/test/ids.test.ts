import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, hashToken, newCode, newToken } from '../src/ids.js';

describe('ids', () => {
  it('makes 6-character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = newCode(() => false);
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it('retries taken codes and gives up after 20 tries', () => {
    let calls = 0;
    newCode(() => ++calls <= 3);
    expect(calls).toBe(4);
    expect(() => newCode(() => true)).toThrow('Could not allocate a session code');
  });

  it('makes unguessable tokens and stable hashes', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});
