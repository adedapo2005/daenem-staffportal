import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldCheck } from 'lucide-react';
import { api, hasWorkforcePermission, type WorkforceContext } from './auth';
import { AccessControlCenter } from './access-control';
import './access-control-entry.css';

function allowed(context: WorkforceContext) {
  if (context.roles.some((role) => role.code === 'owner')) return context.companies.length > 0;
  return context.companies.some((company) =>
    hasWorkforcePermission(context, 'roles.access', 'manage', company.id) ||
    hasWorkforcePermission(context, 'users.access', 'manage', company.id),
  );
}

function Launcher() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let holdUntil = 0;
    let recoveryTimer: number | undefined;
    const invalidate = () => {
      generation += 1;
      setContext(null);
      setOpen(false);
    };
    const refresh = async () => {
      if (!active || Date.now() < holdUntil) return;
      const requestGeneration = ++generation;
      // Immediately conceal privileged data while authoritative session status is pending.
      setContext(null);
      setOpen(false);
      try {
        // The shared auth helper caches /api/auth/me for 15 seconds: do not use
        // that cache for a privileged Access Control workspace.
        const response = await fetch('/api/auth/me', {
          method: 'GET', credentials: 'include', cache: 'no-store',
          headers: { accept: 'application/json' },
        });
        if (!active || requestGeneration !== generation || !response.ok) return;
        const result = await response.json() as { authenticated?: boolean; context?: WorkforceContext };
        if (active && requestGeneration === generation) {
          setContext(result.authenticated === true && result.context && allowed(result.context) ? result.context : null);
        }
      } catch {
        if (active && requestGeneration === generation) setContext(null);
      }
    };
    const focus = () => { void refresh(); };
    const authorityChanged = () => {
      // Logout broadcasts before its server request completes. Never resurrect
      // the previous session using an in-flight or recently cached auth reply.
      invalidate();
      holdUntil = Date.now() + 3000;
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      recoveryTimer = window.setTimeout(() => { recoveryTimer = undefined; void refresh(); }, 3000);
    };
    const openAccessControl = () => setOpen(true);
    void refresh();
    window.addEventListener('focus', focus);
    window.addEventListener('daenem-auth-changed', authorityChanged);
    window.addEventListener('daenem:open-access-control', openAccessControl);
    const timer = window.setInterval(() => { void refresh(); }, 120_000);
    return () => {
      active = false;
      generation += 1;
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      window.removeEventListener('focus', focus);
      window.removeEventListener('daenem-auth-changed', authorityChanged);
      window.removeEventListener('daenem:open-access-control', openAccessControl);
      window.clearInterval(timer);
    };
  }, []);

  if (!context) return null;
  return <>
    <button className="access-control-launcher" onClick={() => setOpen(true)}>
      <ShieldCheck size={18} /><span>Access Control</span>
    </button>
    {open && <AccessControlCenter context={context} onClose={() => setOpen(false)} />}
  </>;
}

const host = document.createElement('div');
host.id = 'access-control-launcher';
document.body.appendChild(host);
createRoot(host).render(<Launcher />);
