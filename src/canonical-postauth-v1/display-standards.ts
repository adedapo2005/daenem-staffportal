const UI_ACRONYMS = new Set([
  'AI','API','CSV','D1','ERP','HR','IP','IT','KPI','MFA','NGN','PDF','QA','R2','RBAC','UI','URL','UTC','UX',
]);

const BRAND_CASE: Record<string,string> = {
  daenem: 'Daenem', microsoft: 'Microsoft', whatsapp: 'WhatsApp', cloudflare: 'Cloudflare',
  github: 'GitHub', google: 'Google', singapore: 'Singapore',
};

function capitalizePart(part: string) {
  if (!part) return part;
  const upper = part.toUpperCase();
  if (UI_ACRONYMS.has(upper)) return upper;
  const brand = BRAND_CASE[part.toLowerCase()];
  if (brand) return brand;
  if (/^v\d+(?:\.\d+)*$/i.test(part)) return part.toLowerCase();
  if (/^[A-Z0-9]{2,}$/.test(part) && /\d/.test(part)) return part;
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

function titleCaseToken(token: string) {
  return token
    .split(/([-'’])/)
    .map((part) => part === '-' || part === "'" || part === '’' ? part : capitalizePart(part))
    .join('');
}

/** Display-only person-name normalization. Never write this result back to business storage. */
export function formatPersonName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).map(titleCaseToken).join(' ');
}

/**
 * Authored UI label normalizer. Do not pass emails, URLs, filenames, IDs, codes, database values,
 * or free-form user-entered narrative through this function.
 */
export function formatUiLabel(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (/^(https?:\/\/|www\.|\S+@\S+)/i.test(token)) return token;
      const prefix = token.match(/^[^A-Za-z0-9]*/)?.[0] ?? '';
      const suffix = token.match(/[^A-Za-z0-9]*$/)?.[0] ?? '';
      const core = token.slice(prefix.length, token.length - suffix.length || undefined);
      return prefix + titleCaseToken(core) + suffix;
    })
    .join(' ');
}

export function initialsFromPersonName(value: string) {
  return formatPersonName(value).split(/\s+/).slice(0,2).map((part) => part[0] ?? '').join('').toUpperCase();
}
