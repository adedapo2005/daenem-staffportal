import { useEffect } from 'react';

/**
 * The approved V115 KPI components render an animated visual number, but
 * provide the final amount through aria-label on <strong>. A generic strong
 * does not permit aria-label, so screen readers may miss the actual value.
 *
 * Add a valid atomic image role only to those two approved KPI families.
 * The existing final-value aria-label and aria-hidden animation stay intact.
 * Removing Stage 1 restores the original semantic attributes.
 */
const KPI_AMOUNT_SELECTOR =
  '.p-finance-ribbon .p-metric strong[aria-label], .c16-kpis .p-metric strong[aria-label]';

export default function Stage1AccessibleMetrics({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const touched = new Set<HTMLElement>();
    let pendingFrame = 0;
    const normalize = () => {
      const scope = document.querySelector('[data-approved-postlogin="qa-review-v115"]');
      if (!scope) return;
      for (const node of scope.querySelectorAll<HTMLElement>(KPI_AMOUNT_SELECTOR)) {
        if (node.hasAttribute('role')) continue;
        if (!node.getAttribute('aria-label')?.trim()) continue;
        if (!node.querySelector(':scope > span[aria-hidden="true"]')) continue;
        node.setAttribute('role', 'img');
        touched.add(node);
      }
    };
    const schedule = () => {
      if (pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        normalize();
      });
    };

    // Existing workspaces mount asynchronously. Only child additions are
    // observed: changing the ARIA role cannot cause an observer feedback loop.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    normalize();
    return () => {
      observer.disconnect();
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      for (const node of touched) {
        if (node.getAttribute('role') === 'img') node.removeAttribute('role');
      }
      touched.clear();
    };
  }, [enabled]);
  return null;
}
