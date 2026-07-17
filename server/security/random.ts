import crypto from 'crypto';

const DEFAULT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function secureToken(length: number, alphabet: string = DEFAULT_ALPHABET): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('length must be a positive integer');
  }
  if (!alphabet || alphabet.length < 2) {
    throw new Error('alphabet must contain at least two characters');
  }

  const bytes = crypto.randomBytes(length);
  let token = '';
  for (let index = 0; index < length; index += 1) {
    token += alphabet[bytes[index] % alphabet.length];
  }
  return token;
}

export function secureId(prefix: string, length: number = 9): string {
  return `${prefix}-${Date.now()}-${secureToken(length)}`;
}

export function secureNumericCode(length: number = 6): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('length must be a positive integer');
  }

  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return crypto.randomInt(min, max + 1).toString();
}
