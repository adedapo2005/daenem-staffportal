/**
 * Correct misleading V115 demo labels only while an authenticated,
 * permission-scoped ERP route is mounted. Keep the approved source snapshot
 * untouched, and restore original labels on route exit.
 *
 * This does not change the security context or pretend D1 holds records.
 */
export function labelForAuthenticatedWorkspace(original: string, kind: 'session' | 'environment'): string {
  if (kind === 'session') {
    return original.endsWith(' · Demo Session')
      ? original.slice(0, -' · Demo Session'.length) + ' · Authenticated Session'
      : original;
  }
  return original.startsWith('Demo Environment · ')
    ? 'Pre-Production · ' + original.slice('Demo Environment · '.length)
    : original;
}

export function correctLiveErpShellLabels(root: ParentNode): () => void {
  const changes: { element: Element; original: string; replacement: string }[] = [];
  for (const { selector, kind } of [
    { selector: '.p-user-card small', kind: 'session' },
    { selector: '.p-footer > span:nth-child(2)', kind: 'environment' },
  ] as const) {
    const element = root.querySelector(selector);
    if (!element) continue;
    const original = element.textContent || '';
    const replacement = labelForAuthenticatedWorkspace(original, kind);
    if (original === replacement) continue;
    element.textContent = replacement;
    changes.push({ element, original, replacement });
  }
  // Only revert if a label is still ours, so newer UI state is never erased.
  return () => {
    for (const { element, original, replacement } of changes) {
      if (element.textContent === replacement) element.textContent = original;
    }
  };
}
