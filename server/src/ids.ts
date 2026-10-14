import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId(): string {
  return randomUUID();
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not allocate a session code');
}
