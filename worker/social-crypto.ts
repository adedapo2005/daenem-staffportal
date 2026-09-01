const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SocialCryptoEnv { SOCIAL_TOKEN_KEY?: string }

function bytesToBase64Url(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const decoded = atob(normalized);
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}

async function keyFor(env: SocialCryptoEnv) {
  const secret = String(env.SOCIAL_TOKEN_KEY || '').trim();
  if (!secret) throw new Error('SOCIAL_TOKEN_KEY is not configured. Social account tokens cannot be stored safely.');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSocialSecret(env: SocialCryptoEnv, plaintext: string) {
  const key = await keyFor(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSocialSecret(env: SocialCryptoEnv, ciphertext: string) {
  const [version, ivText, dataText] = ciphertext.split('.');
  if (version !== 'v1' || !ivText || !dataText) throw new Error('Unsupported encrypted Social Engine secret format.');
  const key = await keyFor(env);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(ivText) }, key, base64UrlToBytes(dataText));
  return decoder.decode(decrypted);
}
