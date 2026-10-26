import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, CheckCircle2, Database, LockKeyhole, RefreshCw, ChevronRight } from 'lucide-react';
import type { WorkforceContext } from './auth';
import { authorisedLiveWorkspaces, liveRouteCompanyScope } from './authorised-live-workspaces';
import { usePathname, useRouter } from './next-navigation-shim';
import './stage1-live-erp-route-bridge.css';

import { liveRouteForPath, type LiveErpRoute as LiveRoute } from './stage1-live-erp-route-contract';
import { correctLiveErpShellLabels } from './stage1-live-erp-shell-labels';

const Forms = lazy(() => import('./centers').then((module) => ({ default: module.FormsCenter })));
const Facilities = lazy(() => import('./centers').then((module) => ({ default: module.FacilitiesCenter })));
// The existing SpendCenter is a genuine authenticated ERP workflow.
// Its standalone-launcher entrypoint is not mounted inside V115.
const Spend = lazy(() => import('./spend-entry').then((module) => ({ default: module.SpendCenter })));

const TITLES: Record<LiveRoute, { title: string; detail: string }> = {
  forms: {
    title: 'Forms Center',
    detail: 'Assigned forms, controlled dropdowns, approvals and recorded submissions',
  },
  facilities: {
    title: 'Facilities & Maintenance',
    detail: 'Registered equipment, maintenance work and verifiable meter readings',
  },
  spend: {
    title: 'Spend, Cost & Profit Intelligence',
    detail: 'Approved company masters, expense requests, evidence and follow-up',
  },
};

/**
 * Outside the preserved V115 reference snapshot, replace ONLY selected demo
 * route content with the actual authenticated ERP components already in this
 * repository. No writes, credentials, or permissions are sourced from the
 * preview session; the real /api/auth/me context remains authoritative.
 */
export default function Stage1LiveErpRouteBridge({ context }: { context: WorkforceContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const route = liveRouteForPath(pathname);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!route) {
      setMount(null);
      return;
    }
    const locate = () => {
      const node = document.querySelector<HTMLElement>(
        '[data-approved-postlogin="qa-review-v115"] #main-content',
      );
      setMount((current) => current === node ? current : node);
    };
    locate();
    // Portal mounts lazily. This observer only finds its content node and
    // never rewrites, edits, or removes a preserved V115 snapshot element.
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [route]);

  useEffect(() => {
    if (!mount || !route) return;
    mount.dataset.daenemLiveRoute = route;
    document.documentElement.dataset.daenemLiveRoute = route;
    return () => {
      delete mount.dataset.daenemLiveRoute;
      delete document.documentElement.dataset.daenemLiveRoute;
    };
  }, [mount, route]);

  useEffect(() => {
    if (!route || !mount) return;
    // The legacy approved visual reference uses demo labels in the persistent
    // nav/footer. Fix their presentation only for these actual ERP routes.
    const root = document.querySelector<HTMLElement>('[data-approved-postlogin="qa-review-v115"]');
    if (!root) return;
    return correctLiveErpShellLabels(root);
  }, [route, mount]);

  // The authenticated grants, not a picker or default company, drive the pages.
  const authorisedWorkspaces = useMemo(() => authorisedLiveWorkspaces(context), [context]);
  const moduleWorkspaces = authorisedWorkspaces.filter((item) => item.pages.some((page) => page.route === route));
  const scope = liveRouteCompanyScope(pathname, route || 'forms', authorisedWorkspaces);
  const displayedWorkspaces = scope.explicit
    ? scope.workspace ? [scope.workspace] : []
    : route === 'spend' && moduleWorkspaces.length > 1 ? [] : moduleWorkspaces;
  const contextFor = (scopeId: string | null): WorkforceContext => scopeId === null
    ? context
    : { ...context, companies: context.companies.filter((item) => item.id === scopeId) };

  if (!route || !mount) return null;
  const title = TITLES[route];
  return createPortal(
    <section
      className="daenem-live-erp-root"
      data-live-erp-source="authenticated-cloudflare-d1"
      data-live-erp-module={route}
      aria-label={title.title}
    >
      <header className="daenem-live-erp-header">
        <div className="daenem-live-erp-heading">
          <span className="daenem-live-erp-eyebrow"><Database size={15} aria-hidden="true" /> AUTHENTICATED PRE-PRODUCTION WORKSPACE</span>
          <h2>{title.title}</h2>
          <p>{title.detail}</p>
        </div>
        <span className="daenem-live-erp-authority"><CheckCircle2 size={17} aria-hidden="true" /> Permission-Scoped ERP</span>
      </header>
      {moduleWorkspaces.length === 0 ? (
        <div className="daenem-live-erp-denied" role="status">
          <LockKeyhole size={25} aria-hidden="true" />
          <strong>Workspace Access Not Assigned</strong>
          <p>Your authenticated account has no permission for this module in any assigned company.</p>
        </div>
      ) : (
        <>
          <nav className="daenem-live-erp-company-directory" aria-label="Company modules and authorised pages">
            {authorisedWorkspaces.map((item) => (
              <section className="daenem-live-erp-directory-company" key={item.scopeId || 'group'}>
                <h3><Building2 size={17} aria-hidden="true" />{item.scopeName}</h3>
                <div className="daenem-live-erp-directory-pages">
                  {item.pages.map((page) => (
                    <button
                      type="button"
                      key={page.route}
                      data-authorised-company={item.scopeId || 'group'}
                      data-authorised-page={page.route}
                      aria-current={scope.workspace?.scopeId === item.scopeId && route === page.route ? 'page' : undefined}
                      onClick={() => router.push(page.href)}
                    >{page.label}<ChevronRight size={14} aria-hidden="true" /></button>
                  ))}
                </div>
              </section>
            ))}
          </nav>
          {scope.denied && (
            <div className="daenem-live-erp-denied" role="alert">
              <LockKeyhole size={23} aria-hidden="true" />
              <strong>This company page is not assigned to your account.</strong>
              <p>Use the automatically displayed authorised pages above. No company access is granted through the URL.</p>
            </div>
          )}
          {!scope.denied && displayedWorkspaces.length === 0 && (
            <div className="daenem-live-erp-directory-hint" role="status">
              <strong>All authorised pages are shown above.</strong>
              <p>Open the permitted Spend page under its company; there is no separate company-selection step.</p>
            </div>
          )}
          {!scope.denied && displayedWorkspaces.map((entry) => (
            <section className="daenem-live-erp-scoped-page" key={entry.scopeId || 'group'}
              data-authorised-company-workspace={entry.scopeId || 'group'}>
              <header><Building2 size={18} aria-hidden="true" />
                <div><strong>{entry.scopeName}</strong><small>{title.title} · access from assigned permissions</small></div>
              </header>
              <Suspense fallback={<div className="daenem-live-erp-loading" role="status">
                <RefreshCw size={18} aria-hidden="true" /> Opening authorised records…
              </div>}>
                {route === 'forms' && <Forms context={contextFor(entry.scopeId)} companyId={entry.scopeId} />}
                {route === 'facilities' && entry.scopeId !== null && <Facilities context={contextFor(entry.scopeId)} companyId={entry.scopeId} />}
                {route === 'spend' && entry.scopeId !== null && <Spend context={contextFor(entry.scopeId)}
                  fixedCompanyId={entry.scopeId} initialTab="requests" onClose={() => router.push('/home')} />}
              </Suspense>
            </section>
          ))}
        </>
      )}
    </section>,
    mount,
  );
}
