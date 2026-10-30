import {
  normalizeSignInPreferences,
  type SignInExperiencePreferences,
} from './signin-preferences';

/**
 * Only trusted Worker GET responses with explicit Group authority may populate
 * this review. Never modify browser preferences or publish public V180.
 */
export class StudioPermissionDenied extends Error {
  constructor() {
    super('Studio permission is not currently granted.');
    this.name = 'StudioPermissionDenied';
  }
}

export type StudioReviewData = {
  published: SignInExperiencePreferences;
  draft: SignInExperiencePreferences | null;
};

export type StudioDraftDifference = {
  path: string;
  section: string;
  before: string;
  after: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

async function trustedGet(path: string, signal: AbortSignal): Promise<JsonRecord> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new StudioPermissionDenied();
  }
  if (!response.ok) throw new Error('Studio settings could not be verified.');
  const payload = record(await response.json());
  if (!payload) throw new Error('Invalid Studio settings response.');
  if (payload.canManage !== true) throw new StudioPermissionDenied();
  // The Worker must independently establish Group authority, rather than
  // recycling context.permissions (a MAX across company memberships).
  // Current deployed Worker omits this explicit contract; fail closed until
  // Backend A defines and proves its separate Group grant at both endpoints.
  const authority = record(payload.groupSignInAuthority);
  if (authority?.scope !== 'group' || authority.level !== 'manage' ||
      authority.basis !== 'explicit-group-assignment') {
    throw new StudioPermissionDenied();
  }
  return payload;
}

export async function readStudioReviewWithoutSideEffects(signal: AbortSignal): Promise<StudioReviewData> {
  const current = await trustedGet('/api/theme/signin', signal);
  if (!record(current.config)) throw new Error('Published Studio settings were unavailable.');
  // Fetch the privileged draft only AFTER the Worker has verified the current
  // user's management grant. The second route must independently grant access.
  const draft = await trustedGet('/api/theme/signin/draft', signal);
  if (!Object.prototype.hasOwnProperty.call(draft, 'draft')) {
    throw new Error('Studio draft state was not returned.');
  }
  if (draft.draft !== null && !record(draft.draft)) {
    throw new Error('Invalid Studio draft response.');
  }
  return {
    published: normalizeSignInPreferences(current.config),
    draft: draft.draft === null ? null : normalizeSignInPreferences(draft.draft),
  };
}

function categoryFor(path: string): string {
  if (path.startsWith('labels.auth.')) return 'Authentication copy';
  if (path.startsWith('labels.')) return 'Branding and wording';
  if (path.startsWith('widget') || path.startsWith('hiddenWidgets')) return 'Widgets and layout';
  if (path.startsWith('clock') || path.startsWith('globalOperations.') || path === 'temperatureUnit') return 'Global operations';
  if (path.startsWith('logo') || path.startsWith('background') || path.startsWith('theme') || path.startsWith('dark')) return 'Appearance';
  if (path.startsWith('effects.') || path === 'effectLevel') return 'Motion and effects';
  if (path.startsWith('content.')) return 'Editorial content';
  return 'Additional presentation settings';
}

function flattenFields(value: unknown, prefix = '', output = new Map<string, string>()): Map<string, string> {
  // An entire ordered array is one auditable setting. Its order is important
  // for widgets and clock zones; do not fabricate stable indices as records.
  if (Array.isArray(value) || value === null || typeof value !== 'object') {
    output.set(prefix, JSON.stringify(value) ?? 'unknown');
    return output;
  }
  for (const key of Object.keys(value as JsonRecord).sort()) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const next = prefix ? prefix + '.' + key : key;
    flattenFields((value as JsonRecord)[key], next, output);
  }
  return output;
}

function shortValue(value: string) {
  return value.length > 150 ? value.slice(0, 147) + '…' : value;
}

export function studioDraftDifferences(
  published: SignInExperiencePreferences,
  draft: SignInExperiencePreferences | null,
): StudioDraftDifference[] {
  if (draft === null) return [];
  const before = flattenFields(published);
  const after = flattenFields(draft);
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .filter(path => before.get(path) !== after.get(path))
    .map(path => ({
      path,
      section: categoryFor(path),
      before: shortValue(before.get(path) ?? 'Not set'),
      after: shortValue(after.get(path) ?? 'Not set'),
    }));
}
