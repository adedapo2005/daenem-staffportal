import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { WorkforceContext } from './auth';
import Portal from './qa-review-v115/app/experience/Portal';
import { sessionForProfile } from './qa-review-v115/app/experience/security-contract';
import type { Company, Session } from './qa-review-v115/app/experience/model';
import './qa-review-v115/app/globals.css';

const APPROVED_SOURCE = {
  project: 'appgprj_6ab43337da788191886fa3d18457bc30',
  version: '115',
  commit: '09bd2051d118242bce095be012a3a763cc1f8a33',
} as const;

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
      onClickCapture={(event) => {
        if (!isConfirmedSignOut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        void onLogout();
      }}
    >
      <Portal />
    </div>
  );
}
