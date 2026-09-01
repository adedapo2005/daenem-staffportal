import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarCheck2, X } from 'lucide-react';
import { api, type WorkforceContext } from './auth';
import { AttendancePanel } from './attendance';
import './attendance-entry.css';

function canUseAttendance(context: WorkforceContext) {
  return (context.permissions['attendance.access'] || 'none') !== 'none';
}

function QuickAttendance() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
        if (active && result.context && canUseAttendance(result.context)) setContext(result.context);
      } catch {
        if (active) setContext(null);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener('focus', handler);
    return () => { active = false; window.removeEventListener('focus', handler); };
  }, []);

  if (!context) return null;
  const primaryCompany = context.companies.find((company) => company.primary)?.id || context.companies[0]?.id;

  return <>
    <button className="quick-attendance-button" onClick={() => setOpen(true)} aria-label="Open attendance">
      <CalendarCheck2 size={20} /><span>Attendance</span>
    </button>
    {open && <div className="quick-attendance-backdrop" onClick={() => setOpen(false)}>
      <aside className="quick-attendance-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="quick-attendance-head"><div><span>DAENEM WORKFORCE HUB</span><strong>{context.employee.displayName}</strong></div><button onClick={() => setOpen(false)} aria-label="Close attendance"><X size={19} /></button></div>
        <AttendancePanel context={context} companyId={primaryCompany} />
      </aside>
    </div>}
  </>;
}

const host = document.createElement('div');
host.id = 'quick-attendance-root';
document.body.appendChild(host);
createRoot(host).render(<QuickAttendance />);
