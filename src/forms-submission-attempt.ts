/**
 * An online Forms submit and its offline fallback are one logical attempt.
 * A lost HTTP response must not turn a single accepted submission into two
 * writes/audits after the device reconnects.
 *
 * Tokens are transient, per authenticated session/grant scope (the component
 * recreates this coordinator when scope changes). A new payload or record
 * version gets a fresh token; retrying unchanged work reuses its token.
 */
export function createFormSubmissionAttemptTokens(generate: () => string) {
  const attempts = new Map<string, { fingerprint: string; key: string }>();

  function get(
    assignmentId: string,
    companyId: string | null,
    responses: Record<string, unknown>,
    baseUpdatedAt?: string | null,
  ): string {
    const fingerprint = JSON.stringify([companyId, baseUpdatedAt || null, responses]);
    const current = attempts.get(assignmentId);
    if (current?.fingerprint === fingerprint) return current.key;
    const key = generate();
    if (!key || !/^[A-Za-z0-9:_-]{1,200}$/.test(key))
      throw new Error('A secure form submission identity could not be created.');
    attempts.set(assignmentId, { fingerprint, key });
    return key;
  }

  function forget(assignmentId: string) {
    attempts.delete(assignmentId);
  }

  return { get, forget };
}
