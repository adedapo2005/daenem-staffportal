import { type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

// Stage One overlay for the protected V115 Workspace Callout import.
// Re-export the existing approved primitives without modifying the V115 snapshot.
export * from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/ui';

/**
 * V115 Callout wraps arbitrary children in <p>. The People workspace supplies
 * a complete paragraph for its error state, which creates invalid nested <p>
 * markup. Retain the approved p-callout DOM and visual classes, but wrap only
 * primitive text as a paragraph; pass pre-structured JSX through untouched.
 */
export function Callout({
  title,
  children,
  tone = 'amber',
}: {
  title: string;
  children?: ReactNode;
  tone?: string;
}) {
  const isText = typeof children === 'string' || typeof children === 'number';
  return (
    // Dynamic policy failures and confirmations need accessible announcements.
    // Do not announce static neutral or amber informational callouts.
    <div className={`p-callout ${tone}`} role={tone === 'red' ? 'alert' : tone === 'green' ? 'status' : undefined}>
      <AlertCircle size={19}/>
      <div>
        <strong>{title}</strong>
        {children == null || children === false ? null
          : isText ? <p>{children}</p> : children}
      </div>
    </div>
  );
}
