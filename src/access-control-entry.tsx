import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldCheck } from 'lucide-react';
import { api, type WorkforceContext } from './auth';
import { AccessControlCenter } from './access-control';
import './access-control-entry.css';

function allowed(context: WorkforceContext) {
  return context.roles.some((role) => role.code === 'owner') ||
    context.permissions['roles.access'] === 'manage' ||
    context.permissions['users.access'] === 'manage';
}

function Launcher() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
        if (active) setContext(result.context && allowed(result.context) ? result.context : null);
      } catch { if (active) setContext(null); }
    };
    const focus = () => void refresh();
    const openAccessControl = () => setOpen(true);
    void refresh();
    window.addEventListener('focus', focus);
    window.addEventListener('daenem:open-access-control', openAccessControl);
    const timer = window.setInterval(() => void refresh(), 120_000);
    return () => {
      active = false;
      window.removeEventListener('focus', focus);
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
