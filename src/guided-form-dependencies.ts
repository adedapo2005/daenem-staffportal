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
export function guidedFieldVisible(schema: readonly GuidedField[], answers: Answers, field: GuidedField): boolean {
  if (!field.showWhen) return true;
  const parent = schema.find(s => s.key === field.showWhen?.fieldKey);
  if (!parent || !guidedFieldVisible(schema,answers,parent)) return false;
  return has(answers,parent.key) && answers[parent.key] === field.showWhen.equals;
}
export function guidedVisibleFields(schema: readonly GuidedField[], answers: Answers): GuidedField[] {
  return schema.filter(f=>guidedFieldVisible(schema, answers, f));
}
export function pruneHiddenGuidedAnswers(schema: readonly GuidedField[], answers: Answers): Answers {
  const result: Answers = {};
  for (const field of guidedVisibleFields(schema,answers)) if (has(answers,field.key)) result[field.key] = answers[field.key];
  return result;
}
export function guidedCompletion(schema: readonly GuidedField[], answers: Answers) {
  const active = guidedVisibleFields(schema,answers);
  const required = active.filter(f=>f.required);
  const missing = required.filter(f=>blank(answers[f.key]) || (f.type === 'checkbox' && answers[f.key] !== true));
  return {completed:required.length-missing.length,total:required.length,
    missingLabels:missing.map(f=>f.label),
    percent:required.length?Math.round(100*(required.length-missing.length)/required.length):100};
}
