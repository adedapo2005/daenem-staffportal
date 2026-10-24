/**
 * Authoritative form dropdown validation. Keep this independent of UI so both
 * direct submissions and offline replays use the same server-side contract.
 * Existing stored form schemas with fewer options can still be submitted if
 * their answer exactly matches a value stored in the schema.
 */
export function validNewSelectOptions(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 30) return false;
  const seen = new Set<string>();
  for (const option of value) {
    if (typeof option !== 'string' || option.length === 0 || option.length > 120
      || option !== option.trim() || /\s{2,}/.test(option)) return false;
    const canonical = option.normalize('NFKC').toLocaleLowerCase();
    if (seen.has(canonical)) return false;
    seen.add(canonical);
  }
  return true;
}

/**
 * Never accept a typed free-text answer for a controlled selection.
 * For optional fields, null/undefined/empty are allowed but not arbitrary
 * values. Do not coerce numbers, objects or arrays into strings.
 */
export function validSubmittedSelectAnswer(
  response: unknown,
  approvedOptions: unknown,
  required: boolean,
): boolean {
  if (response === null || response === undefined || response === '') return !required;
  return typeof response === 'string' && Array.isArray(approvedOptions)
    && approvedOptions.some((choice) => typeof choice === 'string' && choice === response);
}
