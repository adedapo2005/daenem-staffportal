/**
 * StaffPortal Forms submit-time completeness checks. This is intentionally
 * independent of React and D1 so direct requests and offline replay share it.
 * Authoritative record/company/permission checks remain in worker/forms.ts.
 */
import { guidedFieldVisible } from '../src/guided-form-dependencies';

export type CompletenessField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  showWhen?: { fieldKey: string; equals: string | boolean };
};

export type CompletenessPolicy = {
  requireLocation?: boolean;
  requirePhoto?: boolean;
  requireSignature?: boolean;
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
};

export type CompletenessIssue = {
  code: 'FORM_ANSWER_INVALID' | 'FORM_FIELD_REQUIRED' | 'FORM_EVIDENCE_UNSUPPORTED' | 'FORM_LOCATION_INVALID' | 'FORM_SCHEMA_INVALID';
  message: string;
  field?: string;
};

const supported = new Set(['text', 'textarea', 'number', 'date', 'checkbox', 'select', 'file', 'photo', 'signature', 'location']);
const reserved = new Set(['__proto__', 'constructor', 'prototype']);
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const issue = (code: CompletenessIssue['code'], message: string, field?: string): CompletenessIssue =>
  field ? { code, message, field } : { code, message };

const empty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

function validDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (typeof value !== 'string' || !decimal.test(value)) return false;
  const parsed = Number(value);
  if (parsed === 0 && /[1-9]/.test(value.replace(/[eE].*$/, ''))) return false;
  return Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER;
}

function validCoordinates(policy: CompletenessPolicy): boolean {
  const { latitude, longitude, accuracy } = policy;
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && (accuracy === undefined || accuracy === null ||
      (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0));
}

/** Returns the first user-actionable issue; null means field types are valid. */
export function checkFormAnswerCompleteness(
  schema: readonly CompletenessField[],
  responses: unknown,
  policy: CompletenessPolicy = {},
): CompletenessIssue | null {
  if (!Array.isArray(schema) || schema.length < 1 || schema.length > 60)
    return issue('FORM_SCHEMA_INVALID', 'This form configuration needs administrator review.');
  if (!responses || typeof responses !== 'object' || Array.isArray(responses))
    return issue('FORM_ANSWER_INVALID', 'Form answers must be supplied as a record.');

  const answers = responses as Record<string, unknown>;
  const allowed = new Set<string>();
  for (const field of schema) {
    if (!field || typeof field.key !== 'string' || typeof field.label !== 'string'
      || !/^[A-Za-z][A-Za-z0-9_]{1,50}$/.test(field.key) || reserved.has(field.key)
      || !field.label.trim() || !supported.has(field.type) || allowed.has(field.key))
      return issue('FORM_SCHEMA_INVALID', 'This form configuration needs administrator review.');
    allowed.add(field.key);
  }
  if (Object.keys(answers).some(key => !allowed.has(key)))
    return issue('FORM_ANSWER_INVALID', 'The form answers no longer match its approved fields. Refresh and review the form.');

  // A free-text claim is not verified photo/signature evidence. Do not claim
  // success for a form whose required evidence has no authenticated binding.
  if (policy.requirePhoto || policy.requireSignature)
    return issue('FORM_EVIDENCE_UNSUPPORTED',
      'This form requires verified photo or signature evidence. Save a draft; verified evidence submission is not available for this form yet.');

  for (const field of schema) {
    const value = Object.prototype.hasOwnProperty.call(answers, field.key) ? answers[field.key] : undefined;
    if (!guidedFieldVisible(schema, answers, field)) {
      if (!empty(value)) return issue('FORM_ANSWER_INVALID', field.label + ' is no longer applicable. Review the form.', field.key);
      continue;
    }
    if (['file', 'photo', 'signature', 'location'].includes(field.type) && (field.required || !empty(value)))
      return issue('FORM_EVIDENCE_UNSUPPORTED',
        field.label + ' requires verified evidence that this form cannot currently accept. Save a draft.', field.key);
    if (field.required && (empty(value) || (field.type === 'checkbox' && value !== true)))
      return issue('FORM_FIELD_REQUIRED', field.label + ' is required.', field.key);
    if (empty(value)) continue;
    switch (field.type) {
      case 'text':
      case 'textarea':
        if (typeof value !== 'string' || value.length > (field.type === 'text' ? 32768 : 65536) || value.includes('\u0000'))
          return issue('FORM_ANSWER_INVALID', field.label + ' must contain valid text.', field.key);
        break;
      case 'number':
        if (!validNumber(value)) return issue('FORM_ANSWER_INVALID', field.label + ' must be a valid number.', field.key);
        break;
      case 'date':
        if (!validDate(value)) return issue('FORM_ANSWER_INVALID', field.label + ' must be a valid calendar date.', field.key);
        break;
      case 'checkbox':
        if (typeof value !== 'boolean') return issue('FORM_ANSWER_INVALID', field.label + ' must be answered Yes or No.', field.key);
        break;
      case 'select':
        // Exact option membership is separately enforced by worker/forms.ts.
        break;
      case 'file':
      case 'photo':
      case 'signature':
      case 'location':
        break;
    }
  }
  if (policy.requireLocation && !validCoordinates(policy))
    return issue('FORM_LOCATION_INVALID', 'A valid current GPS location is required before submission.');
  return null;
}
