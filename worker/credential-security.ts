const encoder = new TextEncoder();

export type CredentialEnv = {
  APP_STAGE?: string;
  AUTH_PEPPER?: string;
};

export const WORKER_SAFE_PASSWORD_ITERATIONS = 8000;

export function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomSaltHex() {
  return bytesToHex(randomBytes(16));
}

function pepper(env: CredentialEnv) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}

export async function derivePasswordHash(
  env: CredentialEnv,
  password: string,
  salt: string,
  iterations = WORKER_SAFE_PASSWORD_ITERATIONS,
) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured.');
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${password}\u0000${secret}`),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations },
    material,
    256,
  );
  return bytesToHex(new Uint8Array(result));
}

const TEMP_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const TEMP_DIGITS = '23456789';
const TEMP_SYMBOLS = '!@$%?+-_';
const TEMP_ALL = `${TEMP_UPPER}${TEMP_LOWER}${TEMP_DIGITS}${TEMP_SYMBOLS}`;

function pick(chars: string) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return chars[values[0] % chars.length];
}

export function generateTemporaryPassword(length = 16) {
  const required = [pick(TEMP_UPPER), pick(TEMP_LOWER), pick(TEMP_DIGITS), pick(TEMP_SYMBOLS)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(TEMP_ALL));
  const chars = [...required, ...rest];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const swap = values[0] % (index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join('');
}

export function permanentPasswordErrors(password: string) {
  const errors: string[] = [];
  if (password.length < 6) errors.push('Use at least 6 characters.');
  if (password.length > 128) errors.push('Use no more than 128 characters.');
  if (new Set(['123456', 'password', 'qwerty', 'abcdef', 'welcome', 'daenem']).has(password.toLowerCase())) {
    errors.push('Choose a less common password.');
  }
  return errors;
}
