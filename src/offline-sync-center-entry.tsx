import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Cloud, Laptop, LockKeyhole, RefreshCw, ShieldCheck, UserRound, WifiOff, X } from 'lucide-react';
import { api, type WorkforceContext } from './auth';
import './offline-sync-center.css';

type SessionRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string;
  companyId?: string;
  appVersion?: string;
  platform?: string;
  clientTimezone?: string;
  pendingCount?: number;
  syncStatus?: string;
  lastSuccessfulSyncAt?: string;
  lastFailedSyncAt?: string;
  lastReportedAt?: string;
  networkLocation?: string;
  lastReportedIp?: string;
};

type TelemetryRow = {
  employeeId: string;
  employeeName: string;
  companyId?: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  clientTimezone?: string;
  pendingCount?: number;
  syncStatus?: string;
  lastSuccessfulSyncAt?: string;
  lastFailedSyncAt?: string;
  lastErrorCategory?: string;
  lastReportedAt: string;
  ipAddress?: string;
  networkLocation?: string;
};

type ReceiptRow = {
  id: string;
  operationId: string;
  employeeId: string;
  employeeName: string;
  companyId?: string;
  operationKind: string;
  entityType: string;
  entityId?: string;
  state: string;
  attemptCount: number;
  lastErrorCategory?: string;
  serverReceivedAt?: string;
  completedAt?: string;
  updatedAt: string;
};

type Policy = {
  enabled: boolean;
  maxOfflineAgeMinutes: number;
  maxQueueCount: number;
  attachmentMaxBytes: number;
  automaticSync: boolean;
  manualRetry: boolean;
  retentionDays: number;
  allowedOperations: string[];
};

type OwnerOverview = {
  serverTime: string;
  businessTimezone: string;
  freshness: string;
  summary: { activeSessions: number; telemetryDevices: number; reportedPending: number; needsAttention: number };
  sessions: SessionRow[];
  telemetry: TelemetryRow[];
  receipts: ReceiptRow[];
  policy: Policy;
};

function owner(context: WorkforceContext) {
  return context.roles.some((role) => role.code === 'owner');
}

function date(value?: string) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function freshness(value?: string) {
  if (!value) return 'No report received';
  const age = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return age < 2 ? 'Reported moments ago' : 'Last reported ' + age + ' minute' + (age === 1 ? '' : 's') + ' ago';
}

function statusIcon(value?: string) {
  if (value === 'synced' || value === 'online') return <CheckCircle2 size={15} />;
  if (value === 'needs_attention') return <AlertCircle size={15} />;
  if (value === 'offline') return <WifiOff size={15} />;
  return <Cloud size={15} />;
}

function Launcher() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me')
      .then((result) => { if (active && result.context && owner(result.context)) setContext(result.context); })
      .catch(() => { if (active) setContext(null); });
    const launch = () => setOpen(true);
    window.addEventListener('daenem:open-sync-sessions', launch);
    return () => { active = false; window.removeEventListener('daenem:open-sync-sessions', launch); };
  }, []);
  if (!context) return null;
  return <>
    <button className="offline-sync-center-launcher" hidden aria-hidden="true" onClick={() => setOpen(true)}>Sync & Sessions</button>
    {open && <SyncCenter context={context} onClose={() => setOpen(false)} />}
  </>;
}

function SyncCenter({ context, onClose }: { context: WorkforceContext; onClose: () => void }) {
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'overview' | 'sessions' | 'activity'>('overview');
  const [policy, setPolicy] = useState<Policy | null>(null);
  async function load() {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<OwnerOverview>('/api/offline/owner/overview');
      setData(result);
      setPolicy(result.policy);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync and session evidence could not be loaded.');
    } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function revoke(session: SessionRow) {
    const companyId = session.companyId || context.companies[0]?.id;
    if (!companyId) return;
    setBusy(true);
    try {
      const result = await api<{ message?: string }>('/api/offline/owner/revoke', {
        method: 'POST',
        body: JSON.stringify({ companyId, employeeId: session.employeeId, sessionId: session.id, action: 'revoke_session', reason: 'Owner revoked a Staff Portal session from Sync & Sessions.' }),
      });
      setMessage(result.message || 'Session revoked.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The session could not be revoked.'); }
    finally { setBusy(false); }
  }
  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    if (!policy) return;
    setBusy(true);
    try {
      const result = await api<{ policy: Policy }>('/api/offline/owner/policy', { method: 'POST', body: JSON.stringify(policy) });
      setPolicy(result.policy);
      setMessage('Offline policy updated.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The offline policy could not be updated.'); }
    finally { setBusy(false); }
  }
  return <div className="offline-center-backdrop" onClick={onClose}>
    <section className="offline-center-shell" role="dialog" aria-modal="true" aria-labelledby="offline-center-title" onClick={(event) => event.stopPropagation()}>
      <header className="offline-center-head">
        <div><span className="offline-center-mark"><ShieldCheck size={20} /></span><div><small>CONTROLS · SYSTEM CONTROL</small><h2 id="offline-center-title">Sync & Sessions</h2><p>Owner-only operational evidence for employee sessions, offline work, sync receipts and revocation state.</p></div></div>
        <div className="offline-center-head-actions"><button type="button" onClick={() => void load()} disabled={busy} aria-label="Refresh Sync & Sessions"><RefreshCw className={busy ? 'offline-spin' : ''} size={18} /></button><button type="button" onClick={onClose} disabled={busy} aria-label="Close Sync & Sessions"><X size={20} /></button></div>
      </header>
      {data && <div className="offline-center-freshness"><Cloud size={15} /><span>{data.freshness} · Server time {date(data.serverTime)} WAT</span></div>}
      {message && <div className="offline-center-message" role="status">{message}</div>}
      <nav className="offline-center-tabs" aria-label="Sync and session sections">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
        <button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>Sessions <b>{data?.summary.activeSessions || 0}</b></button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Sync activity <b>{data?.summary.needsAttention || 0}</b></button>
      </nav>
      {!data ? <div className="offline-center-loading"><RefreshCw className="offline-spin" size={26} /><strong>Loading server evidence…</strong></div> : tab === 'overview' ? <main className="offline-center-body">
        <section className="offline-center-kpis"><article><small>Active sessions</small><strong>{data.summary.activeSessions}</strong><span>Live server session check</span></article><article><small>Reported pending</small><strong>{data.summary.reportedPending}</strong><span>Client-reported, not live while offline</span></article><article><small>Devices reporting</small><strong>{data.summary.telemetryDevices}</strong><span>Application-scoped IDs</span></article><article className={data.summary.needsAttention ? 'warn' : ''}><small>Needs attention</small><strong>{data.summary.needsAttention}</strong><span>Conflicts or rejected receipts</span></article></section>
        <section className="offline-center-grid"><article className="offline-center-card"><header><Laptop size={17} /><div><strong>Recent device health</strong><small>Network location is coarse request metadata. It is not GPS.</small></div></header>{data.telemetry.length ? data.telemetry.slice(0, 8).map((item) => <div className="offline-device-row" key={item.employeeId + item.deviceId}><span className="offline-device-icon">{statusIcon(item.syncStatus)}</span><div><strong>{item.employeeName}</strong><small>{item.deviceName || 'Browser'} · {item.platform || 'web'} · {item.appVersion || 'build not reported'}</small><small>{item.ipAddress || 'IP unavailable'} · {item.networkLocation || 'Network location unavailable'}</small></div><aside><b>{item.syncStatus?.replaceAll('_', ' ') || 'unknown'}</b><small>{freshness(item.lastReportedAt)}</small></aside></div>) : <div className="offline-center-empty">No client telemetry has been reported yet.</div>}</article>
          <article className="offline-center-card"><header><LockKeyhole size={17} /><div><strong>Policy guardrails</strong><small>Policy never extends an employee’s live session or permission scope.</small></div></header>{policy && <form className="offline-policy-form" onSubmit={savePolicy}><label><span>Maximum offline age (minutes)</span><input type="number" min="5" max="43200" value={policy.maxOfflineAgeMinutes} onChange={(event) => setPolicy({ ...policy, maxOfflineAgeMinutes: Number(event.target.value) })} /></label><label><span>Maximum queued items</span><input type="number" min="1" max="500" value={policy.maxQueueCount} onChange={(event) => setPolicy({ ...policy, maxQueueCount: Number(event.target.value) })} /></label><label><span>Attachment limit (bytes)</span><input type="number" min="1024" max="52428800" value={policy.attachmentMaxBytes} onChange={(event) => setPolicy({ ...policy, attachmentMaxBytes: Number(event.target.value) })} /></label><label className="offline-policy-check"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy({ ...policy, enabled: event.target.checked })} /><span>Platform enabled</span></label><label className="offline-policy-check"><input type="checkbox" checked={policy.automaticSync} onChange={(event) => setPolicy({ ...policy, automaticSync: event.target.checked })} /><span>Automatic sync enabled</span></label><button className="offline-center-primary" disabled={busy}>Save policy</button></form>}</article></section>
        <section className="offline-center-card offline-center-explain"><header><UserRound size={17} /><div><strong>Privacy and freshness</strong><small>What this view can and cannot know</small></div></header><p>Each device receives a random application-scoped device ID. Server-observed IP and Cloudflare’s coarse network location are recorded separately from any user-consented GPS capture. An offline device cannot report live health; the last reported time is shown above. Revoking a session prevents its cookie from authenticating and stops queued mutations from flushing.</p></section>
      </main> : tab === 'sessions' ? <main className="offline-center-body"><section className="offline-center-card"><header><Laptop size={17} /><div><strong>Active and recent sessions</strong><small>No passwords, cookies or session tokens are displayed.</small></div></header><div className="offline-session-list">{data.sessions.length ? data.sessions.map((session) => { const active = !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now(); return <article key={session.id}><span className={active ? 'session-live' : 'session-closed'}>{active ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}</span><div><strong>{session.employeeName}</strong><small>{session.deviceName || 'Browser session'} · {session.platform || 'web'} · {session.deviceId || 'device ID unavailable'}</small><small>{session.ipAddress || 'IP unavailable'} · network {session.networkLocation || 'not reported'} · {session.clientTimezone || 'timezone not reported'}</small><small>Created {date(session.createdAt)} · last seen {date(session.lastSeenAt)} · expires {date(session.expiresAt)}</small></div><aside><b>{active ? 'Active' : session.revokedAt ? 'Revoked' : 'Expired'}</b>{active && <button disabled={busy} onClick={() => void revoke(session)}>Revoke</button>}</aside></article>; }) : <div className="offline-center-empty">No sessions found.</div>}</div></section></main> : <main className="offline-center-body"><section className="offline-center-card"><header><Cloud size={17} /><div><strong>Sync receipts</strong><small>Server results are immutable evidence; conflicts remain visible for review.</small></div></header><div className="offline-receipt-list">{data.receipts.length ? data.receipts.map((receipt) => <article key={receipt.id}><span className={receipt.state === 'completed' ? 'receipt-good' : receipt.state === 'conflict' ? 'receipt-warn' : 'receipt-bad'}>{receipt.state === 'completed' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span><div><strong>{receipt.employeeName} · Forms submission</strong><small>{receipt.state.replaceAll('_', ' ')} · {receipt.attemptCount} attempt{receipt.attemptCount === 1 ? '' : 's'} · {receipt.lastErrorCategory || 'no error category'}</small><small>Received {date(receipt.serverReceivedAt)} · updated {date(receipt.updatedAt)}</small></div></article>) : <div className="offline-center-empty">No sync receipts found.</div>}</div></section></main>}
      <footer className="offline-center-footer"><span>Daenem business time: Africa/Lagos (WAT). Network location is not GPS.</span><span>Owner authorization is checked again by every control endpoint.</span></footer>
    </section>
  </div>;
}

const host = document.createElement('div');
host.id = 'daenem-offline-sync-center-root';
document.body.appendChild(host);
import('react-dom/client').then(({ createRoot }) => createRoot(host).render(<Launcher />));
