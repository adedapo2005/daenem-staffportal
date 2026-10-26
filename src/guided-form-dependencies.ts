/**
 * StaffPortal W2: deterministic conditional field visibility and completeness.
 * Shared between UI guidance and server submission. No company picker, cross-company
 * queries, executable expressions, or AI-generated authority.
 */
export type GuidedField = {
  key: string; label: string; type: string; required?: boolean;
  options?: string[];
  showWhen?: { fieldKey: string; equals: string | boolean };
};
type Answers = Record<string, unknown>;
const has = (a: Answers, k: string) => Object.prototype.hasOwnProperty.call(a, k);
const blank = (x: unknown) => x === null || x === undefined || (typeof x === 'string' && x.trim() === '');
export function validGuidedDependencies(schema: readonly GuidedField[]): boolean {
  if (!Array.isArray(schema) || schema.length < 1 || schema.length > 60) return false;
  const before = new Map<string, GuidedField>();
  for (const field of schema) {
    if (!field || !/^[A-Za-z][A-Za-z0-9_]{1,50}$/.test(field.key) || before.has(field.key)) return false;
    if (field.showWhen !== undefined) {
      const c = field.showWhen;
      if (!c || typeof c !== 'object' || Array.isArray(c)
          || Object.keys(c).length !== 2 || !has(c as unknown as Answers,'fieldKey')
          || !has(c as unknown as Answers,'equals') || typeof c.fieldKey !== 'string') return false;
      const parent = before.get(c.fieldKey);
      if (!parent) return false;
      if (parent.type === 'checkbox') {
        if (typeof c.equals !== 'boolean') return false;
      } else if (parent.type === 'select') {
        if (typeof c.equals !== 'string' || !Array.isArray(parent.options) || !parent.options.includes(c.equals)) return false;
      } else return false;
    }
    before.set(field.key,field);
  }
  return true;
}

const validTypes = new Set(['text','textarea','number','date','checkbox','select','file','photo','signature','location']);
const forbiddenKeys = new Set(['__proto__','constructor','prototype']);

/** Untrusted historical schema from D1 must never reach recursive rendering unchecked. */
export function validGuidedFormSchema(schema: unknown): schema is GuidedField[] {
  if (!Array.isArray(schema) || !validGuidedDependencies(schema)) return false;
  for (const field of schema) {
    if (!field || typeof field.key !== 'string' || forbiddenKeys.has(field.key)
      || typeof field.label !== 'string' || !field.label.trim()
      || typeof field.type !== 'string' || !validTypes.has(field.type)) return false;
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 30
        || field.options.some(option => typeof option !== 'string' || !option.trim())) return false;
    }
  }
  return true;
}

/** Never claim a Forms submission is ready when verified evidence cannot be collected. */
export function guidedFormEvidenceBlocker(
  schema: readonly GuidedField[],
  answers: Answers,
  policy: { requirePhoto?: boolean; requireSignature?: boolean } = {},
): string | null {
  if (!validGuidedFormSchema(schema)) return 'This form has an invalid configuration. Ask an administrator to review it.';
  if (policy.requirePhoto || policy.requireSignature)
    return 'This form requires verified photo or signature evidence that the current Forms Center cannot collect. Save your draft and contact an administrator.';
  const requiredEvidence = guidedVisibleFields(schema, answers)
    .find(field => field.required && ['file','photo','signature','location'].includes(field.type));
  return requiredEvidence
    ? requiredEvidence.label + ' requires a verified evidence workflow that is not available in this form yet. Save your draft and contact an administrator.'
    : null;
}

export function guidedFieldVisible(schema: readonly GuidedField[], answers: Answers, field: GuidedField, seen = new Set<string>()): boolean {
  // Bound the recursion even if a caller bypasses schema validation on corrupt legacy data.
  if (seen.has(field.key)) return false;
  seen.add(field.key);
  if (!field.showWhen) return true;
  const parent = schema.find(s => s.key === field.showWhen?.fieldKey);
  if (!parent || !guidedFieldVisible(schema,answers,parent,seen)) return false;
  return has(answers,parent.key) && answers[parent.key] === field.showWhen.equals;
}
export function guidedVisibleFields(schema: readonly GuidedField[], answers: Answers): GuidedField[] {
  if (!validGuidedFormSchema(schema)) return [];
  return schema.filter(f=>guidedFieldVisible(schema, answers, f));
}
export function pruneHiddenGuidedAnswers(schema: readonly GuidedField[], answers: Answers): Answers {
  const result: Answers = {};
  for (const field of guidedVisibleFields(schema,answers)) if (has(answers,field.key)) result[field.key] = answers[field.key];
  return result;
}
/**
 * Same value-level truth required by the Worker: non-empty is not enough.
 * In particular, invalid dates, unsafe numbers and unapproved choices must
 * never count as complete in a user's progress meter.
 */
export function validGuidedAnswer(field: GuidedField, value: unknown): boolean {
  if (blank(value)) return false;
  switch (field.type) {
    case 'text':
    case 'textarea':
      return typeof value === 'string'
        && value.length <= (field.type === 'text' ? 32768 : 65536)
        && !value.includes('\u0000');
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
      if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return false;
      const n = Number(value);
      return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER
        && !(n === 0 && /[1-9]/.test(value.replace(/[eE].*$/, '')));
    }
    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(value + 'T00:00:00.000Z');
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    case 'checkbox': return typeof value === 'boolean' && (!field.required || value);
    case 'select': return typeof value === 'string' && Array.isArray(field.options)
      && field.options.includes(value);
    default: return false; // Evidence requires separate server-authorised verification.
  }
}

export function guidedInvalidAnswers(schema: readonly GuidedField[], answers: Answers): string[] {
  return guidedVisibleFields(schema, answers)
    .filter(field => !blank(answers[field.key]) && !validGuidedAnswer(field, answers[field.key]))
    .map(field => field.label);
}

export function guidedCompletion(schema: readonly GuidedField[], answers: Answers) {
  const active = guidedVisibleFields(schema, answers);
  const required = active.filter(f => f.required);
  const missing = required.filter(f => !validGuidedAnswer(f, answers[f.key]));
  return {
    completed: required.length - missing.length,
    total: required.length,
    missingLabels: missing.map(f => f.label),
    percent: required.length
      ? Math.round(100 * (required.length - missing.length) / required.length)
      : 100,
  };
}
