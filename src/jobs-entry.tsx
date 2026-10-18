import React, { useEffect, useState } from 'react';
import { BriefcaseBusiness, ClipboardCheck, FileText, UsersRound, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { api, hasWorkforcePermission, type WorkforceContext } from './auth';
import { RecruitmentWorkspace } from './jobs-recruitment-workspace';
import './jobs-recruitment.css';

function canAccess(context: WorkforceContext) {
  return context.employee.status === 'active' && context.companies.some((company) => hasWorkforcePermission(context, 'jobs.access', 'view', company.id));
}

function JobsWorkspace({ context, onClose }: { context: WorkforceContext; onClose: () => void }) {
  const features = [
    { label: 'Applications', detail: 'Review and organize authorized candidate applications.', icon: FileText },
    { label: 'Interviews', detail: 'Coordinate interview stages and interviewer notes.', icon: UsersRound },
    { label: 'Hiring', detail: 'Move approved candidates through the hiring workflow.', icon: ClipboardCheck },
  ];
  return <div className="jobs-erp-backdrop" onClick={onClose}>
    <section className="jobs-erp-panel" role="dialog" aria-modal="true" aria-labelledby="jobs-erp-title" onClick={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">JOBS ERP · TALENT ACQUISITION</span><h2 id="jobs-erp-title">Hiring workspace</h2><p>Applications, interviews, and hiring stay together in this protected ERP.</p></div><button className="icon-button" onClick={onClose} aria-label="Close Jobs ERP"><X size={19} /></button></header>
      <div className="jobs-erp-grid">{features.map((feature) => {
        const Icon = feature.icon;
        return <article key={feature.label}><span className="jobs-erp-icon"><Icon size={18} /></span><strong>{feature.label}</strong><p>{feature.detail}</p><small>Authorized Jobs ERP function</small></article>;
      })}</div>
      <div className="jobs-erp-empty"><BriefcaseBusiness size={22} /><div><strong>Workspace ready for your hiring records</strong><span>Data visibility and actions remain controlled by your Jobs ERP role permissions.</span></div></div>
      <footer><span>{context.employee.displayName} · {context.employee.department || 'Talent operations'}</span><button className="primary-button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}

function Launcher() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
        if (active) setContext(result.context && canAccess(result.context) ? result.context : null);
      } catch {
        if (active) setContext(null);
      }
    };
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener('focus', onFocus); };
  }, []);
  if (!context) return null;
  return <><button className="jobs-erp-launcher" type="button" onClick={() => setOpen(true)}><BriefcaseBusiness size={18} /><span>Jobs ERP</span></button>{open && <RecruitmentWorkspace context={context} onClose={() => setOpen(false)} />}</>;
}

const host = document.createElement('div');
host.id = 'jobs-erp-launcher';
document.body.appendChild(host);
createRoot(host).render(<Launcher />);
