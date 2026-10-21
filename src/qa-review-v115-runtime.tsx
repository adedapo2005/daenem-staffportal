import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import type { WorkforceContext } from './auth';
import Portal from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal';
import { sessionForProfile } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/security-contract';
import type { Company, Session } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model';
import '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/globals.css';
import './postlogin-premium-refinement-v1.css';
import './staffportal-stage1-palette.css';
import LivePostLoginEnhancementsV116 from './postlogin-live-widgets-v116';
import Stage1SearchResults from './stage1-live-search';
import Stage1AccessibleMetrics from './stage1-accessible-metrics';
import Stage1WorkflowFocus from './stage1-workflow-focus';
import Stage1AppearanceStudio from './stage1-appearance-studio';
import {
  POSTLOGIN_DEFAULT_PALETTE,
  normalizePostLoginPaletteId,
  postLoginPaletteVariables,
  type PostLoginPaletteId,
} from './postlogin-palette-system';
import { Stage1RuntimeContext, type Stage1NavigationRole } from './stage1-runtime-context';
import './stage1-live-search.css';
import './stage1-context-density.css';
import './stage1-finance-visibility.css';
import './stage1-finance-workbench.css';
import './stage1-forms-workbench.css';
import './stage1-enterprise-tables.css';
import './stage1-construction-workspace.css';
import './stage1-a11y-contrast.css';
import './stage1-large-text-reflow.css';

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

function companyNavigationRole(context: WorkforceContext, fallback: Stage1NavigationRole): Stage1NavigationRole {
  const currentCompany = context.companies.find((company) => company.primary) || context.companies[0];
  if (!currentCompany) return fallback;
  // Navigation is a presentation layer, not a grant: use this company's actual
  // assigned roles rather than the global union of roles across all companies.
  const companyRoles = context.roles.filter((role) => role.companyId === currentCompany.id);
  if (!companyRoles.length) return fallback;
  const names = companyRoles.map((role) => `${role.code} ${role.name}`).join(' ').toLowerCase();
  if (/owner|super.?admin/.test(names)) return 'Owner';
  if (/manager|admin|lead|supervisor/.test(names)) return 'Manager';
  return 'Employee';
}

function isConfirmedSignOut(event: ReactMouseEvent<HTMLDivElement>) {
  const button = (event.target as HTMLElement).closest('button');
  return button?.textContent?.trim() === 'Sign out' && Boolean(button.closest('[role="dialog"]'));
}

export default function ApprovedPostLoginV115({ context, onLogout }: { context: WorkforceContext; onLogout: () => Promise<void> }) {
  const session = useMemo(() => sessionFor(context), [context]);
  const [stage1Enabled, setStage1Enabled] = useState(true);
  const [postLoginPalette, setPostLoginPalette] = useState<PostLoginPaletteId>(() =>
    typeof window === 'undefined'
      ? POSTLOGIN_DEFAULT_PALETTE
      : normalizePostLoginPaletteId(window.sessionStorage.getItem('daenem-postlogin-palette')),
  );
  const paletteVariables = useMemo(() => postLoginPaletteVariables(postLoginPalette) as CSSProperties, [postLoginPalette]);
  const navigationRole = useMemo(() => companyNavigationRole(context, session.role === 'Experience Admin' ? 'Manager' : session.role), [context, session.role]);

  useEffect(() => {
    const html = document.documentElement;
    const syncLargeTextMode = () => {
      const rootFontSize = Number.parseFloat(window.getComputedStyle(html).fontSize || '16');
      if (rootFontSize >= 20) html.dataset.largeText = 'true';
      else delete html.dataset.largeText;
    };
    syncLargeTextMode();
    window.addEventListener('resize', syncLargeTextMode);
    window.visualViewport?.addEventListener('resize', syncLargeTextMode);
    return () => {
      window.removeEventListener('resize', syncLargeTextMode);
      window.visualViewport?.removeEventListener('resize', syncLargeTextMode);
      delete html.dataset.largeText;
    };
  }, []);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ palette?: string }>).detail;
      const palette = normalizePostLoginPaletteId(detail?.palette);
      setPostLoginPalette(palette);
      window.sessionStorage.setItem('daenem-postlogin-palette', palette);
    };
    window.addEventListener('daenem:postlogin-palette-change', update);
    const controller = new AbortController();
    fetch('/api/theme/postlogin/policy', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async (response) => response.ok
        ? await response.json() as { effectivePalette?: string }
        : null)
      .then((value) => {
        if (!value?.effectivePalette) return;
        const palette = normalizePostLoginPaletteId(value.effectivePalette);
        setPostLoginPalette(palette);
        window.sessionStorage.setItem('daenem-postlogin-palette', palette);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      window.removeEventListener('daenem:postlogin-palette-change', update);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const variables = postLoginPaletteVariables(postLoginPalette);
    html.dataset.staffportalPostlogin = 'true';
    html.dataset.postloginPalette = postLoginPalette;
    for (const [name, value] of Object.entries(variables)) html.style.setProperty(name, value);
    return () => {
      delete html.dataset.staffportalPostlogin;
      delete html.dataset.postloginPalette;
      for (const name of Object.keys(variables)) html.style.removeProperty(name);
    };
  }, [postLoginPalette]);

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
      // Release Details owns the reversible Stage 1 view choice.
      let stage1Toggle = dialog.querySelector<HTMLButtonElement>('[data-stage1-rollback-toggle]');
      if (!stage1Toggle) {
        stage1Toggle = document.createElement('button');
        stage1Toggle.type = 'button';
        stage1Toggle.className = 'stage1-rollback-toggle';
        stage1Toggle.dataset.stage1RollbackToggle = 'true';
        stage1Toggle.addEventListener('click', () => setStage1Enabled((enabled) => !enabled));
        manifest.insertAdjacentElement('beforebegin', stage1Toggle);
      }
      const toggleLabel = stage1Enabled ? 'Use previous interface' : 'Restore Stage 1 experience';
      if (stage1Toggle.textContent !== toggleLabel) stage1Toggle.textContent = toggleLabel;
      stage1Toggle.setAttribute('aria-pressed', String(!stage1Enabled));
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
  }, [stage1Enabled]);

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('daenem-demo-session-v3', JSON.stringify(session));
    if (window.location.pathname === '/' || window.location.pathname.startsWith('/workspace')) {
      window.history.replaceState({}, '', '/home');
    }
  }

  return (
    <div
      data-approved-postlogin="qa-review-v115"
      data-stage1-palette={stage1Enabled ? "bright" : "previous"}
      data-postlogin-palette={stage1Enabled ? postLoginPalette : "previous"}
      style={stage1Enabled ? paletteVariables : undefined}
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
      <Stage1RuntimeContext.Provider value={{ enabled: stage1Enabled, companyRole: navigationRole }}>
        <Portal />
      </Stage1RuntimeContext.Provider>
      <LivePostLoginEnhancementsV116 />
      <Stage1SearchResults enabled={stage1Enabled} />
      <Stage1AccessibleMetrics enabled={stage1Enabled} />
      <Stage1RuntimeContext.Provider value={{ enabled: stage1Enabled, companyRole: navigationRole }}>
        <Stage1WorkflowFocus />
      </Stage1RuntimeContext.Provider>
      <Stage1AppearanceStudio enabled={stage1Enabled} />
    </div>
  );
}
