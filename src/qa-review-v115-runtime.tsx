import { useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { WorkforceContext } from './auth';
import Portal from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal';
import { sessionForProfile } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/security-contract';
import type { Company, Session } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model';
import '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/globals.css';
import './postlogin-premium-refinement-v1.css';
import './staffportal-premium-shell.css';
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
    const updateReleaseDialog = () => {
      const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
        .find((item) => item.querySelector('h2')?.textContent?.trim() === 'Release Details');
      if (!dialog) return;
      const placeholder = Array.from(dialog.querySelectorAll<HTMLParagraphElement>('p'))
        .find((item) => item.textContent?.includes('Detailed release notes are not available'));
      if (placeholder) placeholder.textContent = `Approved UI V${APPROVED_SOURCE.version} with live runtime R${STAGING_BUILD.runtime}, deployed ${stagingDeploymentLabel()}.`;
      let manifest = dialog.querySelector<HTMLElement>('.v116-release-manifest');
      if (!manifest) {
        manifest = document.createElement('section');
        manifest.className = 'v116-release-manifest';
        manifest.setAttribute('aria-label', 'Staging deployment manifest');
        const close = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'Close');
        if (close) close.insertAdjacentElement('beforebegin', manifest); else dialog.insertAdjacentElement('beforeend', manifest);
      }
      if (manifest.dataset.commit === STAGING_BUILD.commit) return;
      manifest.dataset.commit = STAGING_BUILD.commit;
      manifest.replaceChildren();
      const heading = document.createElement('strong');
      heading.textContent = 'Staging deployment';
      manifest.insertAdjacentElement('beforeend', heading);
      const addLine = (label: string, value: string) => {
        const line = document.createElement('div');
        const key = document.createElement('b');
        key.textContent = `${label}: `;
        line.insertAdjacentElement('beforeend', key);
        line.insertAdjacentText('beforeend', value);
        manifest?.insertAdjacentElement('beforeend', line);
      };
      addLine('Approved design', `QA Review V${APPROVED_SOURCE.version}`);
      addLine('Design source', `${APPROVED_SOURCE.commit.slice(0, 7)} · Oct 5, 2026`);
      addLine('Stage release', STAGING_BUILD.release);
      addLine('Live runtime', `R${STAGING_BUILD.runtime}`);
      addLine('Stage commit', STAGING_BUILD.commit);
      addLine('Pushed to stage', stagingDeploymentLabel());
      const listHeading = document.createElement('b');
      listHeading.textContent = 'Completed work included';
      manifest.insertAdjacentElement('beforeend', listHeading);
      const list = document.createElement('ul');
      STAGING_BUILD.completedWork.forEach((item) => {
        const row = document.createElement('li');
        row.textContent = item;
        list.insertAdjacentElement('beforeend', row);
      });
      manifest.insertAdjacentElement('beforeend', list);
      if (STAGING_BUILD.runId) addLine('GitHub run', STAGING_BUILD.runId);
    };
    const updateReleaseDetails = () => {
      updateReleaseChip();
      updateReleaseDialog();
    };
    updateReleaseDetails();
    const observer = new MutationObserver(updateReleaseDetails);
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
    </div>
  );
}
