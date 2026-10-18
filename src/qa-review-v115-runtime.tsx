import { useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { WorkforceContext } from './auth';
import Portal from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal';
import { sessionForProfile } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/security-contract';
import type { Company, Session } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model';
import '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/globals.css';
import LivePostLoginEnhancementsV116 from './postlogin-live-widgets-v116';

const APPROVED_SOURCE = {
  project: 'appgprj_6ab43337da788191886fa3d18457bc30',
  version: '115',
  commit: '09bd2051d118242bce095be012a3a763cc1f8a33',
  exportFiles: '683',
  archiveSha256: 'c52773eb05c01be8fb84810b4c2cc3b42e73416e02d71372f5046cef9dea2fb4',
} as const;

const STAGING_BUILD = {
  release: '2026.10.18',
  runtime: '116',
  commit: import.meta.env.VITE_STAFFPORTAL_BUILD_SHA || 'local-preview',
  branch: import.meta.env.VITE_STAFFPORTAL_BUILD_REF || 'local',
  runId: import.meta.env.VITE_STAFFPORTAL_BUILD_RUN_ID || '',
  deployedAt: import.meta.env.VITE_STAFFPORTAL_DEPLOYED_AT || '',
  completedWork: [
    'Expanded live News and local + international Intelligence sources',
    'Integrated current Weather and daily Inspiration widgets',
    'Refined Clock and Weather icon treatment without changing the top bar',
    'Preserved schema-driven forms without removing or combining fields',
    'Simplified Construction default view with reversible full detail',
    'Printing sales-order and Finance handoff',
    'Autos sale-truth concurrency protection',
    'Theme preference and runtime routing hardening',
    'Recruitment record workspace and scoped API',
    'OneDrive company scope and OAuth token rotation',
    'Payroll reconciliation and paid-truth guard',
    'Owner Intelligence domain and company scoping',
  ],
} as const;

function stagingDeploymentLabel() {
  if (!STAGING_BUILD.deployedAt) return 'Deployment time unavailable';
  const value = new Date(STAGING_BUILD.deployedAt);
  if (Number.isNaN(value.getTime())) return STAGING_BUILD.deployedAt;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(value);
}

function companyFor(context: WorkforceContext): Company {
  const company = context.companies.find((item) => item.primary) || context.companies[0];
  const value = `${company?.code || ''} ${company?.name || ''}`.toLowerCase();
  if (value.includes('printing') || value.includes('technology')) return 'printing';
  if (value.includes('bakery')) return 'bakery';
  if (value.includes('autos') || value.includes('automotive')) return 'autos';
  if (value.includes('logistics')) return 'logistics';
  if (value.includes('properties') || value.includes('homes')) return 'properties';
  return 'group';
}

function sessionFor(context: WorkforceContext): Session {
  const roleText = context.roles.map((role) => `${role.code} ${role.name}`).join(' ').toLowerCase();
  const profile = /owner|super.?admin/.test(roleText)
    ? 'Owner'
    : /manager|admin|lead|supervisor/.test(roleText)
      ? 'Manager'
      : 'Employee';
  const approved = sessionForProfile(profile);
  const company = companyFor(context);
  return {
    ...approved,
    company,
    personId: context.employee.id,
    displayName: context.employee.displayName,
    displayTimeZone: context.employee.timezone || approved.displayTimeZone || 'Africa/Lagos',
    profile,
    assignments: approved.assignments?.map((assignment) => ({
      ...assignment,
      companies: company === 'group' ? assignment.companies : [company],
    })),
  };
}

function isConfirmedSignOut(event: ReactMouseEvent<HTMLDivElement>) {
  const button = (event.target as HTMLElement).closest('button');
  return button?.textContent?.trim() === 'Sign out' && Boolean(button.closest('[role="dialog"]'));
}

export default function ApprovedPostLoginV115({ context, onLogout }: { context: WorkforceContext; onLogout: () => Promise<void> }) {
  const session = useMemo(() => sessionFor(context), [context]);

  useEffect(() => {
    const updateReleaseChip = () => {
      const chip = document.querySelector<HTMLElement>('[data-version-state="saved"]');
      if (!chip) return;
      const label = `V${APPROVED_SOURCE.version} · R${STAGING_BUILD.runtime} · 10/18`;
      const text = chip.querySelector<HTMLElement>('span');
      if (text && text.textContent !== label) text.textContent = label;
      const ariaLabel = `Open Release Details, approved UI V${APPROVED_SOURCE.version}, live runtime R${STAGING_BUILD.runtime}, staging ${STAGING_BUILD.release}`;
      if (chip.getAttribute('aria-label') !== ariaLabel) chip.setAttribute('aria-label', ariaLabel);
      chip.dataset.stageRelease = STAGING_BUILD.release;
    };
    updateReleaseChip();
    const observer = new MutationObserver(updateReleaseChip);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('daenem-demo-session-v3', JSON.stringify(session));
    if (window.location.pathname === '/' || window.location.pathname.startsWith('/workspace')) {
      window.history.replaceState({}, '', '/home');
    }
  }

  return (
    <div
      data-approved-postlogin="qa-review-v115"
      data-approved-project={APPROVED_SOURCE.project}
      data-approved-version={APPROVED_SOURCE.version}
      data-source-commit={APPROVED_SOURCE.commit}
      data-export-file-count={APPROVED_SOURCE.exportFiles}
      data-export-archive-sha256={APPROVED_SOURCE.archiveSha256}
      data-staging-build-commit={STAGING_BUILD.commit}
      data-staging-build-branch={STAGING_BUILD.branch}
      data-staging-deployed-at={STAGING_BUILD.deployedAt}
      onClickCapture={(event) => {
        if (!isConfirmedSignOut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        void onLogout();
      }}
    >
      <Portal />
      <LivePostLoginEnhancementsV116 />
      <details
        aria-label="StaffPortal staging deployment details"
        style={{
          position: 'fixed',
          right: '12px',
          bottom: '12px',
          zIndex: 2147483000,
          maxWidth: 'min(360px, calc(100vw - 24px))',
          border: '1px solid rgba(15, 53, 74, 0.18)',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.96)',
          boxShadow: '0 12px 34px rgba(11, 48, 71, 0.16)',
          color: '#10374b',
          font: '600 11px/1.35 Inter, system-ui, sans-serif',
          backdropFilter: 'blur(14px)',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            listStyle: 'none',
            padding: '9px 12px',
            letterSpacing: '0.02em',
          }}
        >
          STAGING {STAGING_BUILD.release} · UI V{APPROVED_SOURCE.version} · R{STAGING_BUILD.runtime} · {STAGING_BUILD.commit.slice(0, 7)} · {stagingDeploymentLabel()}
        </summary>
        <div style={{ borderTop: '1px solid rgba(15, 53, 74, 0.12)', padding: '10px 12px', fontWeight: 500 }}>
          <div><strong>Approved design:</strong> QA Review V{APPROVED_SOURCE.version}</div>
          <div><strong>Design source:</strong> {APPROVED_SOURCE.commit.slice(0, 7)} (Oct 5, 2026)</div>
          <div><strong>Stage release:</strong> {STAGING_BUILD.release}</div>
          <div><strong>Live runtime:</strong> R{STAGING_BUILD.runtime}</div>
          <div><strong>Stage commit:</strong> {STAGING_BUILD.commit}</div>
          <div><strong>Pushed to stage:</strong> {stagingDeploymentLabel()}</div>
          <div style={{ marginTop: '8px' }}><strong>Completed work included:</strong></div>
          <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
            {STAGING_BUILD.completedWork.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {STAGING_BUILD.runId ? (
            <div><strong>GitHub run:</strong> {STAGING_BUILD.runId}</div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
