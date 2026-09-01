import React, { useEffect, useMemo, useState } from 'react';
import {
  BellRing, Bot, CalendarClock, Check, CheckCheck, Megaphone, Radio,
  RefreshCw, Send, ShieldAlert, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { api, type AccessLevel, type WorkforceContext } from './auth';
import './broadcast-center.css';

const rank: Record<AccessLevel, number> = { none: 0, view: 1, create: 2, edit: 3, approve: 4, manage: 5 };
const can = (context: WorkforceContext, minimum: AccessLevel = 'view') =>
  rank[context.permissions['broadcasts.access'] || 'none'] >= rank[minimum];

type DirectoryEmployee = { id: string; displayName: string; jobTitle?: string; department?: string; companyName: string };
type DirectoryRole = { id: string; name: string };
type Broadcast = {
  id: string; companyName?: string; broadcastType: string; title: string; message: string; severity: string;
  audienceType: string; status: string; recipientCount: number; readCount: number; acknowledgedCount: number;
  pushNotification: number; acknowledgementRequired: number; scheduledFor?: string; expiresAt?: string; createdAt: string;
};
type MyBroadcast = {
  id: string; broadcastType: string; title: string; message: string; severity: string;
  acknowledgementRequired: number; publishedAt?: string; expiresAt?: string; readAt?: string; acknowledgedAt?: string;
};
type PendingReceipt = { broadcastId: string; action: 'read' | 'acknowledge'; queuedAt: string };
type Draft = {
  title: string; message: string; broadcastType: string; severity: string; audienceType: string;
  employeeIds: string[]; roleId: string; department: string; pushNotification: boolean;
  acknowledgementRequired: boolean; scheduledFor: string; expiresAt: string;
};

const initialDraft = (): Draft => ({
  title: '', message: '', broadcastType: 'notice', severity: 'information', audienceType: 'company',
  employeeIds: [], roleId: '', department: '', pushNotification: false,
  acknowledgementRequired: false, scheduledFor: '', expiresAt: lagosInput(new Date(Date.now() + 30 * 86_400_000)),
});

function lagosInput(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function watToIso(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}:00+01:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function dateText(value?: string) {
  return value ? new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value)) : '';
}

function noticeCacheKey(employeeId: string) { return `daenem-broadcast-notices:${employeeId}`; }
function receiptQueueKey(employeeId: string) { return `daenem-broadcast-receipts:${employeeId}`; }
function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}

export function BroadcastCenter({ context, companyId }: { context: WorkforceContext; companyId: string | null }) {
  const activeCompanyId = companyId || context.companies.find((company) => company.primary)?.id || context.companies[0]?.id || '';
  const [items, setItems] = useState<Broadcast[]>([]);
  const [mine, setMine] = useState<MyBroadcast[]>(() => readLocal(noticeCacheKey(context.employee.id), []));
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [roles, setRoles] = useState<DirectoryRole[]>([]);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [tone, setTone] = useState('warm, disciplined and positive');
  const [focus, setFocus] = useState('excellent work, accountability, teamwork and customer service');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.department).filter(Boolean) as string[])].sort(), [employees]);
  const selectedEmployees = useMemo(() => new Set(draft.employeeIds), [draft.employeeIds]);

  async function flushReceipts() {
    const key = receiptQueueKey(context.employee.id);
    const queued = readLocal<PendingReceipt[]>(key, []);
    if (!queued.length || !navigator.onLine) return;
    const remaining: PendingReceipt[] = [];
    for (const receipt of queued) {
      try {
        await api(`/api/broadcasts/${receipt.action}`, { method: 'POST', body: JSON.stringify({ broadcastId: receipt.broadcastId }) });
      } catch { remaining.push(receipt); }
    }
    localStorage.setItem(key, JSON.stringify(remaining));
  }

  async function load() {
    setBusy(true);
    try {
      await flushReceipts();
      const mineResult = await api<{ broadcasts: MyBroadcast[] }>('/api/broadcasts/mine');
      setMine(mineResult.broadcasts || []);
      localStorage.setItem(noticeCacheKey(context.employee.id), JSON.stringify(mineResult.broadcasts || []));
      if (can(context)) {
        const allResult = await api<{ broadcasts: Broadcast[] }>('/api/broadcasts');
        setItems(allResult.broadcasts || []);
      }
      if (can(context, 'create') && activeCompanyId) {
        const suffix = `?companyId=${encodeURIComponent(activeCompanyId)}`;
        const [employeeResult, roleResult] = await Promise.all([
          api<{ employees: DirectoryEmployee[] }>(`/api/directory/employees${suffix}`),
          api<{ roles: DirectoryRole[] }>(`/api/directory/roles${suffix}`),
        ]);
        setEmployees(employeeResult.employees || []);
        setRoles(roleResult.roles || []);
      }
      setMessage('');
    } catch (error) {
      if (mine.length) setMessage('Offline mode: showing saved notices. Read actions will sync after reconnection.');
      else setMessage((error as Error).message);
    } finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [activeCompanyId, context.employee.id]);
  useEffect(() => {
    const onlineHandler = () => { setOffline(false); void load(); };
    const offlineHandler = () => setOffline(true);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, [activeCompanyId, context.employee.id]);

  function buildAudience() {
    if (draft.audienceType === 'group') return { type: 'group' };
    if (draft.audienceType === 'company') return { type: 'company', companyId: activeCompanyId };
    if (draft.audienceType === 'role') return { type: 'role', companyId: activeCompanyId, roleId: draft.roleId };
    if (draft.audienceType === 'department') return { type: 'department', companyId: activeCompanyId, department: draft.department };
    return { type: 'selected_employees', companyId: activeCompanyId, employeeIds: draft.employeeIds };
  }

  function setEmergency(field: 'broadcastType' | 'severity', value: string) {
    const emergency = value === 'emergency';
    setDraft((current) => ({
      ...current, [field]: value,
      ...(emergency ? { broadcastType: 'emergency', severity: 'emergency', pushNotification: true, acknowledgementRequired: true } : {}),
    }));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (draft.audienceType !== 'group' && !activeCompanyId) { setMessage('Select a company first.'); return; }
    setBusy(true);
    try {
      const result = await api<{ broadcast: { status: string; scheduledFor?: string } }>('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          ...draft, audience: buildAudience(),
          scheduledFor: watToIso(draft.scheduledFor), expiresAt: watToIso(draft.expiresAt),
        }),
      });
      setDraft(initialDraft());
      setMessage(result.broadcast.scheduledFor
        ? `Broadcast saved as ${result.broadcast.status.replaceAll('_', ' ')} and scheduled in West Africa Time.`
        : `Broadcast saved as ${result.broadcast.status.replaceAll('_', ' ')}.`);
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  async function daily() {
    setBusy(true);
    try {
      const result = await api<{ draft: { message: string } }>('/api/broadcasts/ai-daily-word', {
        method: 'POST', body: JSON.stringify({ companyId: activeCompanyId || undefined, tone, focus }),
      });
      setMessage(`AI Daily Word created for approval: “${result.draft.message}”`);
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  async function action(id: string, actionName: 'approve' | 'publish') {
    setBusy(true);
    try {
      const body = actionName === 'approve' ? { broadcastId: id, decision: 'approve' } : { broadcastId: id };
      await api(`/api/broadcasts/${actionName}`, { method: 'POST', body: JSON.stringify(body) });
      setMessage(actionName === 'approve' ? 'Broadcast approved.' : 'Broadcast published.');
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  function queueReceipt(broadcastId: string, actionName: PendingReceipt['action']) {
    const key = receiptQueueKey(context.employee.id);
    const queue = readLocal<PendingReceipt[]>(key, []);
    const withoutDuplicate = queue.filter((receipt) => !(receipt.broadcastId === broadcastId && receipt.action === actionName));
    localStorage.setItem(key, JSON.stringify([...withoutDuplicate, { broadcastId, action: actionName, queuedAt: new Date().toISOString() }]));
    const now = new Date().toISOString();
    const next = mine.map((item) => item.id === broadcastId ? {
      ...item, readAt: item.readAt || now, ...(actionName === 'acknowledge' ? { acknowledgedAt: now } : {}),
    } : item);
    setMine(next);
    localStorage.setItem(noticeCacheKey(context.employee.id), JSON.stringify(next));
    setMessage('Saved offline. The receipt will sync when the portal reconnects.');
  }

  async function receipt(broadcastId: string, actionName: PendingReceipt['action']) {
    if (offline) { queueReceipt(broadcastId, actionName); return; }
    try {
      await api(`/api/broadcasts/${actionName}`, { method: 'POST', body: JSON.stringify({ broadcastId }) });
      await load();
    } catch (error) {
      if (!(error as { status?: number }).status) queueReceipt(broadcastId, actionName);
      else setMessage((error as Error).message);
    }
  }

  return <div className="center-stack broadcast-center">
    <div className="view-heading">
      <div><span className="eyebrow">GROUP COMMUNICATIONS</span><h2>Notice & Emergency Broadcast Center</h2><p>Target an employee, role, department, company or the full Group. Schedule in WAT, set expiry, and track delivery, reads and acknowledgements.</p></div>
      <button className="text-action" onClick={load} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh</button>
    </div>
    {(message || offline) && <div className={`center-notice ${offline ? 'offline' : ''}`}>{message || 'Offline mode: saved notices remain available and receipts will sync later.'}</div>}

    <section className="center-grid two">
      <article className="panel center-panel">
        <div className="card-heading"><div><span className="eyebrow">EMPLOYEE NOTICE BOARD</span><h3>My notices</h3></div><BellRing size={20} /></div>
        {!mine.length ? <div className="empty-state"><Megaphone size={27} /><strong>No active notices</strong><span>Expired notices are removed automatically.</span></div> :
          <div className="broadcast-feed">{mine.map((item) => <article className={`broadcast-card ${item.severity} ${item.readAt ? 'read' : 'unread'}`} key={item.id}>
            <div className="broadcast-title-row"><div><span>{item.broadcastType.replaceAll('_', ' ')}</span><strong>{item.title}</strong></div>{!item.readAt && <b>New</b>}</div>
            <p>{item.message}</p>
            <div className="notice-meta"><span>{dateText(item.publishedAt)} WAT</span>{item.expiresAt && <span>Expires {dateText(item.expiresAt)} WAT</span>}</div>
            <footer>
              <div>{item.acknowledgedAt ? <b><CheckCheck size={15} /> Acknowledged</b> : item.readAt ? <b><Check size={15} /> Read</b> : null}</div>
              <div className="notice-actions">
                {!item.readAt && <button onClick={() => receipt(item.id, 'read')}>Mark read</button>}
                {item.acknowledgementRequired && !item.acknowledgedAt && <button className="primary-mini" onClick={() => receipt(item.id, 'acknowledge')}>Acknowledge</button>}
              </div>
            </footer>
          </article>)}</div>}
      </article>

      <article className="panel center-panel">
        <div className="card-heading"><div><span className="eyebrow">AI DAILY WORD</span><h3>Encouragement with approval</h3></div><Bot size={20} /></div>
        <div className="ai-broadcast-box">
          <Sparkles size={26} /><p>AI prepares a concise professional encouragement. Every Daily Word remains pending until an authorized approver reviews it.</p>
          <label><span>Tone <em>Optional</em></span><input value={tone} onChange={(event) => setTone(event.target.value)} /></label>
          <label><span>Focus <em>Optional</em></span><textarea rows={2} value={focus} onChange={(event) => setFocus(event.target.value)} /></label>
          <button className="primary-action" disabled={!can(context, 'create') || busy} onClick={daily}><Sparkles size={16} /> Generate approval draft</button>
        </div>
      </article>
    </section>

    {can(context, 'create') && <section className="center-grid two admin-zone">
      <article className="panel center-panel">
        <div className="card-heading"><div><span className="eyebrow">CREATE BROADCAST</span><h3>New workforce notice</h3></div><Radio size={20} /></div>
        <form className="center-form" onSubmit={create}>
          <div className="form-row">
            <label><span>Type <em>Required</em></span><select value={draft.broadcastType} onChange={(event) => setEmergency('broadcastType', event.target.value)}><option value="notice">Notice</option><option value="important">Important</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
            <label><span>Severity <em>Required</em></span><select value={draft.severity} onChange={(event) => setEmergency('severity', event.target.value)}><option value="information">Information</option><option value="important">Important</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
          </div>
          {(draft.broadcastType === 'emergency' || draft.severity === 'emergency') && <div className="emergency-defaults"><ShieldAlert size={18} /><span>Emergency mode forces push notification and acknowledgement. Approval is always required.</span></div>}
          <label><span>Title <em>Required</em></span><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label><span>Message <em>Required</em></span><textarea required rows={5} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label>
          <label><span>Audience <em>Required</em></span><select value={draft.audienceType} onChange={(event) => setDraft({ ...draft, audienceType: event.target.value, employeeIds: [], roleId: '', department: '' })}><option value="company">Current company</option><option value="selected_employees">Selected employees</option><option value="role">Role in current company</option><option value="department">Department in current company</option><option value="group">All Daenem Group</option></select></label>
          {draft.audienceType === 'selected_employees' && <div className="employee-picker broadcast-picker">{employees.map((employee) => <label key={employee.id}><input type="checkbox" checked={selectedEmployees.has(employee.id)} onChange={(event) => setDraft((current) => ({ ...current, employeeIds: event.target.checked ? [...current.employeeIds, employee.id] : current.employeeIds.filter((id) => id !== employee.id) }))} /><span><b>{employee.displayName}</b><small>{employee.jobTitle || employee.department || employee.companyName}</small></span></label>)}</div>}
          {draft.audienceType === 'role' && <label><span>Role <em>Required</em></span><select required value={draft.roleId} onChange={(event) => setDraft({ ...draft, roleId: event.target.value })}><option value="">Select role…</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>}
          {draft.audienceType === 'department' && <label><span>Department <em>Required</em></span><select required value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}><option value="">Select department…</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}
          <div className="form-row schedule-row">
            <label><span>Schedule in WAT <em>Optional</em></span><input type="datetime-local" value={draft.scheduledFor} onChange={(event) => setDraft({ ...draft, scheduledFor: event.target.value })} /></label>
            <label><span>Expiry in WAT <em>Required</em></span><input required type="datetime-local" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} /></label>
          </div>
          <div className="toggle-row">
            <label><input type="checkbox" checked={draft.pushNotification} disabled={draft.broadcastType === 'emergency'} onChange={(event) => setDraft({ ...draft, pushNotification: event.target.checked })} /> Send push notification</label>
            <label><input type="checkbox" checked={draft.acknowledgementRequired} disabled={draft.broadcastType === 'emergency'} onChange={(event) => setDraft({ ...draft, acknowledgementRequired: event.target.checked })} /> Require acknowledgement</label>
          </div>
          <button className="primary-action" disabled={busy || (draft.audienceType === 'selected_employees' && !draft.employeeIds.length)}><Send size={16} /> Create broadcast</button>
        </form>
      </article>

      <article className="panel center-panel">
        <div className="card-heading"><div><span className="eyebrow">APPROVAL & DELIVERY</span><h3>Broadcast queue</h3></div><ShieldCheck size={20} /></div>
        <div className="broadcast-queue">{items.map((item) => {
          const scheduledLater = Boolean(item.scheduledFor && new Date(item.scheduledFor).getTime() > Date.now());
          return <article className="broadcast-queue-item" key={item.id}>
            <div className="queue-title"><div><strong>{item.title}</strong><span>{item.companyName || 'Daenem Group'} · {item.audienceType.replaceAll('_', ' ')}</span></div><b className={`queue-status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</b></div>
            <div className="queue-window">{item.scheduledFor ? <span><CalendarClock size={14} /> {dateText(item.scheduledFor)} WAT</span> : <span>Immediate delivery</span>}{item.expiresAt && <span>Expires {dateText(item.expiresAt)} WAT</span>}</div>
            <div className="delivery-stats"><span><Users size={14} /><b>{item.recipientCount || 0}</b> recipients</span><span><Check size={14} /><b>{item.readCount || 0}</b> read</span><span><CheckCheck size={14} /><b>{item.acknowledgedCount || 0}</b> acknowledged</span></div>
            <div className="queue-actions">
              {['draft', 'pending_approval'].includes(item.status) && can(context, 'approve') && <button onClick={() => action(item.id, 'approve')}>Approve</button>}
              {item.status === 'approved' && can(context, 'approve') && (scheduledLater ? <span className="scheduled-badge"><CalendarClock size={14} /> Scheduled automatically</span> : <button className="primary-mini" onClick={() => action(item.id, 'publish')}>Publish now</button>)}
            </div>
          </article>;
        })}{!items.length && <div className="empty-state"><Megaphone size={27} /><strong>No broadcasts in the queue</strong></div>}</div>
      </article>
    </section>}
  </div>;
}
