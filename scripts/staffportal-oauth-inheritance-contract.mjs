/**
 * Pre-Production OAuth deployment contract.
 *
 * A Worker secret cannot be recovered as plaintext from Cloudflare metadata.
 * The CI job may supply new values explicitly, or safely inherit bindings
 * already configured on the existing staging Worker. Never synthesize secrets.
 */
export const OAUTH_BINDING_ALIASES = Object.freeze({
  GOOGLE_CLIENT_ID: ['GOOGLE_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_ID'],
  GOOGLE_CLIENT_SECRET: ['GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_CLIENT_SECRET'],
  MICROSOFT_CLIENT_ID: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_OAUTH_CLIENT_ID'],
  MICROSOFT_CLIENT_SECRET: ['MICROSOFT_CLIENT_SECRET', 'MICROSOFT_OAUTH_CLIENT_SECRET'],
});
export const REQUIRED_OAUTH_BINDINGS = Object.freeze([
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
]);

const SECRET_BINDINGS = new Set(['GOOGLE_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET']);
const BINDING_TYPES = new Set(['secret_text', 'plain_text']);

export function isConfiguredValue(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !/^(?:\*+|redacted|hidden|null|undefined)$/i.test(value.trim());
}

/** Only explicit GitHub secrets are eligible for upload. */
export function explicitOAuthOverrides(env) {
  return Object.fromEntries(
    Object.entries(OAUTH_BINDING_ALIASES).flatMap(([canonical, names]) => {
      const value = names.map((name) => env[name]).find(isConfiguredValue);
      return value ? [[canonical, value.trim()]] : [];
    }),
  );
}

/**
 * Validate *names and types only* from the current Cloudflare staging Worker.
 * Call only when some required OAuth values are not supplied in GitHub secrets.
 * The returned metadata must never be serialised to CI logs.
 */
export function assertSafeOAuthInheritance(bindings, overrides) {
  if (!Array.isArray(bindings)) {
    throw new Error('Pre-Production OAuth binding metadata is unavailable; refusing deployment.');
  }
  const remote = new Map(
    bindings
      .filter((binding) => binding && typeof binding.name === 'string'
        && typeof binding.type === 'string')
      .map((binding) => [binding.name, binding.type]),
  );
  const missing = [];
  const wrongType = [];
  for (const name of REQUIRED_OAUTH_BINDINGS) {
    if (isConfiguredValue(overrides[name])) continue;
    const type = remote.get(name);
    if (!type) missing.push(name);
    else if (!BINDING_TYPES.has(type) || (SECRET_BINDINGS.has(name) && type !== 'secret_text')) wrongType.push(name);
  }
  if (missing.length || wrongType.length) {
    const issues = [
      missing.length ? 'missing: ' + missing.join(', ') : '',
      wrongType.length ? 'invalid secret binding type: ' + wrongType.join(', ') : '',
    ].filter(Boolean).join('; ');
    throw new Error('Required Pre-Production OAuth binding check failed (' + issues + ').');
  }
  return REQUIRED_OAUTH_BINDINGS.filter((name) => !isConfiguredValue(overrides[name]));
}
