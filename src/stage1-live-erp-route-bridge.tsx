import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, CheckCircle2, Database, LockKeyhole, RefreshCw } from 'lucide-react';
import type { WorkforceContext } from './auth';
import { hasWorkforcePermission } from './auth';
import { usePathname, useRouter } from './next-navigation-shim';
import './stage1-live-erp-route-bridge.css';

type LiveRoute = 'forms' | 'facilities' | 'spend';

const Forms = lazy(() => import('./centers').then((module) => ({ default: module.FormsCenter })));
const Facilities = lazy(() => import('./centers').then((module) => ({ default: module.FacilitiesCenter })));
// The existing SpendCenter is a genuine authenticated ERP workflow.
// Its standalone-launcher entrypoint is not mounted inside V115.
const Spend = lazy(() => import('./spend-entry').then((module) => ({ default: module.SpendCenter })));

export function liveRouteForPath(path: string): LiveRoute | null {
  const pathRoot = path.split('?')[0].split('/').filter(Boolean)[0];
  return pathRoot === 'forms' || pathRoot === 'facilities' || pathRoot === 'spend'
    ? pathRoot : null;
}

function canViewLiveCompany(context: WorkforceContext, route: LiveRoute, companyId: string) {
  if (!context.companies.some((company) => company.id === companyId)) return false;
  if (route === 'forms') return hasWorkforcePermission(context, 'forms.access', 'view', companyId);
  if (route === 'facilities') return hasWorkforcePermission(context, 'facilities.access', 'view', companyId);
  return ['expense.requests', 'expense.own', 'expense.approve', 'expense.master']
    .some((permission) => hasWorkforcePermission(context, permission, 'view', companyId));
}

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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

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

  const companyChoices = useMemo(() => {
    if (!route) return [];
    return context.companies.filter((company) => canViewLiveCompany(context, route, company.id));
  }, [context, route]);

  const company = companyChoices.find((item) => item.id === selectedCompanyId)
    || companyChoices.find((item) => item.primary)
    || companyChoices[0];

  const authorisedContext = useMemo(() => ({
    ...context,
    // Do not present unauthorised company options to the live workflow.
    // Worker company checks and endpoint permissions remain authoritative.
    companies: companyChoices,
  }), [context, companyChoices]);

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
      {companyChoices.length === 0 ? (
        <div className="daenem-live-erp-denied" role="status">
          <LockKeyhole size={25} aria-hidden="true" />
          <strong>Workspace Access Not Assigned</strong>
          <p>Your active StaffPortal account has no permitted company for this module. No demo records are displayed in place of restricted data.</p>
        </div>
      ) : (
        <>
          {route !== 'spend' && (
            <div className="daenem-live-erp-company-row">
              <Building2 size={17} aria-hidden="true" />
              <label htmlFor="daenem-live-company">Working Company</label>
              <select
                id="daenem-live-company"
                value={company?.id || ''}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
              >
                {companyChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <span>Only authorised company records are available.</span>
            </div>
          )}
          <Suspense fallback={<div className="daenem-live-erp-loading" role="status"><RefreshCw size={18} aria-hidden="true" /> Opening authorised records…</div>}>
            {route === 'forms' && <Forms key={'forms-' + company?.id} context={authorisedContext} companyId={company?.id || null} />}
            {route === 'facilities' && <Facilities key={'facilities-' + company?.id} context={authorisedContext} companyId={company?.id || null} />}
            {route === 'spend' && <Spend context={authorisedContext} initialTab="requests" onClose={() => router.push('/home')} />}
          </Suspense>
        </>
      )}
    </section>,
    mount,
  );
}
