import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type WorkforceContext } from './auth';
import { AdminSetup } from './admin-setup';

function canOpen(context: WorkforceContext) {
  return ['settings.access', 'tracking.access', 'security.access'].some((permission) => (context.permissions[permission] || 'none') !== 'none');
}

function AdminLauncher() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      const result = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
      setContext(result.context && canOpen(result.context) ? result.context : null);
    } catch { setContext(null); }
  }

  useEffect(() => {
    refresh();
    const openRequested = () => setOpen(true);
    const handler = () => refresh();
    window.addEventListener('focus', handler);
    window.addEventListener('daenem-auth-changed', handler);
    window.addEventListener('daenem:open-admin', openRequested);
    return () => {
      window.removeEventListener('focus', handler);
      window.removeEventListener('daenem-auth-changed', handler);
      window.removeEventListener('daenem:open-admin', openRequested);
    };
  }, []);

  if (!context) return null;
  return <>
    {open && <AdminSetup context={context} onClose={() => setOpen(false)} />}
  </>;
}

const host = document.createElement('div');
host.id = 'workforce-admin-launcher';
document.body.appendChild(host);
createRoot(host).render(<AdminLauncher />);
