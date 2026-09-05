import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Cloud, Laptop, LockKeyhole, RefreshCw, ShieldCheck, UserRound, WifiOff, X } from 'lucide-react';
import { api, type WorkforceContext } from './auth';
import './offline-sync-center.css';

type TimeMode = 'business' | 'viewer' | 'utc' | 'both';

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

type DetailReceiptRow = Omit<ReceiptRow, 'employeeName'> & {
  sessionId?: string;
  idempotencyKey?: string;
  startedAt?: string;
  outcome?: string;
  submissionId?: string;
  resultStatus?: string;
};

type DetailAuditRow = {
  id: string;
  occurredAt: string;
  action: string;
  companyId?: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  source?: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

type TimelineRow = {
  id: string;
  at: string;
  category: string;
  title: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

type AttachmentRow = {
  id: string;
  companyId?: string;
  operationId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  createdAt?: string;
  uploadedAt?: string;
  reconciledAt?: string;
};

type OwnerDetail = {
  serverTime: string;
  businessTimezone: string;
  employee: { id: string; employeeNo?: string; displayName: string; email?: string; jobTitle?: string; department?: string; status?: string };
  memberships: Array<{ companyId: string; companyCode?: string; companyName: string; locationId?: string; locationName?: string; isPrimary?: number }>;
  roles: Array<{ id: string; code: string; name: string; companyId?: string }>;
  sessions: SessionRow[];
  telemetry: TelemetryRow[];
  receipts: DetailReceiptRow[];
  attachments: AttachmentRow[];
  audit: DetailAuditRow[];
  timeline: TimelineRow[];
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

type DetailFilters = {
  employeeId: string;
  deviceId: string;
  sessionId: string;
  state: string;
  eventType: string;
  companyId: string;
  from: string;
  to: string;
};

const emptyFilters: DetailFilters = { employeeId: '', deviceId: '', sessionId: '', state: '', eventType: '', companyId: '', from: '', to: '' };

function owner(context: WorkforceContext) {
  return context.roles.some((role) => role.code === 'owner');
}

function viewerTimezone(context: WorkforceContext) {
  const configured = (context.employee as WorkforceContext['employee'] & { timezone?: string }).timezone;
  return configured || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatAt(value: string | undefined, businessZone: string, mode: TimeMode, viewerZone: string) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not recorded';
  const format = (timeZone: string) => new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(parsed);
  const business = format(businessZone);
  const viewer = format(viewerZone);
  const utc = format('UTC').replace(/ UTC$/, 'Z');
  if (mode === 'business') return business;
  if (mode === 'viewer') return viewer;
  if (mode === 'utc') return utc;
  return `${business} · ${viewer}`;
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

function filterDate(value: string) {
  if (!value) return '';
  const dateValue = new Date(value);
  return Number.isNaN(dateValue.getTime()) ? '' : dateValue.toISOString();
}

function safeDetailEntries(details?: Record<string, unknown>) {
  const allowed = new Set(['employeeId', 'companyId', 'sessionId', 'deviceId', 'operationId', 'idempotencyKey', 'operationKind', 'outcome', 'errorCategory', 'attemptCount', 'attachmentId', 'mimeType', 'sizeBytes', 'sha256', 'requestId', 'clientTimezone', 'capturedAt', 'serverReceivedAt', 'applicationVersion', 'mismatchDimensions']);
  return Object.entries(details || {}).filter(([key, value]) => allowed.has(key) && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)] as const);
}

function detailLabel(key: string) {
  return ({ operationId: 'Operation', idempotencyKey: 'Idempotency', operationKind: 'Kind', errorCategory: 'Error', attemptCount: 'Attempts', clientTimezone: 'Device timezone', capturedAt: 'Captured on device', serverReceivedAt: 'Server received', applicationVersion: 'Build', mismatchDimensions: 'Mismatch' } as Record<string, string>)[key] || key.replaceAll(/([A-Z])/g, ' $1');
}

function renderSafeDetails(details?: Record<string, unknown>) {
  const entries = safeDetailEntries(details);
  if (!entries.length) return null;
  return <div className="offline-detail-pairs">{entries.map(([key, value]) => <span key={key}><b>{detailLabel(key)}</b>{value}</span>)}</div>;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 1024) return `${value || 0} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function clockDiscrepancy(capturedAt?: string, serverAt?: string) {
  if (!capturedAt || !serverAt) return null;
  const difference = Math.round(Math.abs(new Date(capturedAt).getTime() - new Date(serverAt).getTime()) / 60_000);
  return difference >= 15 ? `Device time differs from the server timeline by ${difference} minutes. Network delay is unknown, so this is an evidence indicator only.` : null;
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
  const [detail, setDetail] = useState<OwnerDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'overview' | 'sessions' | 'activity' | 'detail'>('overview');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [timeMode, setTimeMode] = useState<TimeMode>('both');
  const [filters, setFilters] = useState<DetailFilters>(emptyFilters);
  const [viewerZone] = useState(() => viewerTimezone(context));

  const employees = useMemo(() => {
    const rows = [...(data?.sessions || []), ...(data?.telemetry || []), ...(data?.receipts || [])];
    return Array.from(new Map(rows.map((row) => [row.employeeId, { id: row.employeeId, name: row.employeeName }])).values());
  }, [data]);

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

  async function openDetail(next: DetailFilters) {
    if (!next.employeeId) {
      setMessage('Select an employee before opening detailed evidence.');
      return;
    }
    const params = new URLSearchParams({ employeeId: next.employeeId });
    if (next.deviceId) params.set('deviceId', next.deviceId);
    if (next.sessionId) params.set('sessionId', next.sessionId);
    if (next.state) params.set('state', next.state);
    if (next.eventType) params.set('eventType', next.eventType);
    if (next.companyId) params.set('companyId', next.companyId);
    if (filterDate(next.from)) params.set('from', filterDate(next.from));
    if (filterDate(next.to)) params.set('to', filterDate(next.to));
    setFilters(next);
    setTab('detail');
    setDetailBusy(true);
    setDetail(null);
    setMessage('');
    try {
      setDetail(await api<OwnerDetail>('/api/offline/owner/detail?' + params.toString()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Detailed evidence could not be loaded.');
    } finally { setDetailBusy(false); }
  }

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

  const detailCaptured = detail?.audit.flatMap((row) => {
    const captured = typeof row.details?.capturedAt === 'string' ? row.details.capturedAt : undefined;
    const received = typeof row.details?.serverReceivedAt === 'string' ? row.details.serverReceivedAt : undefined;
    return captured ? [{ captured, received }] : [];
  })[0];
  const detailServerAt = detailCaptured?.received || detail?.receipts[0]?.serverReceivedAt;
  const drift = clockDiscrepancy(detailCaptured?.captured, detailServerAt);

  return <div className="offline-center-backdrop" onClick={onClose}>
    <section className="offline-center-shell" role="dialog" aria-modal="true" aria-labelledby="offline-center-title" onClick={(event) => event.stopPropagation()}>
      <header className="offline-center-head">
        <div><span className="offline-center-mark"><ShieldCheck size={20} /></span><div><small>CONTROLS · SYSTEM CONTROL</small><h2 id="offline-center-title">Sync & Sessions</h2><p>Owner-only operational evidence for employee sessions, offline work, sync receipts and revocation state.</p></div></div>
        <div className="offline-center-head-actions"><button type="button" onClick={() => void load()} disabled={busy} aria-label="Refresh Sync & Sessions"><RefreshCw className={busy ? 'offline-spin' : ''} size={18} /></button><button type="button" onClick={onClose} disabled={busy} aria-label="Close Sync & Sessions"><X size={20} /></button></div>
      </header>
      {data && <div className="offline-center-freshness"><Cloud size={15} /><span>{data.freshness} · Server time {formatAt(data.serverTime, data.businessTimezone, 'business', viewerZone)}</span></div>}
      {message && <div className="offline-center-message" role="status">{message}</div>}
      <nav className="offline-center-tabs" aria-label="Sync and session sections">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
        <button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>Sessions <b>{data?.summary.activeSessions || 0}</b></button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Sync activity <b>{data?.summary.needsAttention || 0}</b></button>
        <button className={tab === 'detail' ? 'active' : ''} disabled={!detail && !detailBusy} onClick={() => setTab('detail')}>Detail</button>
      </nav>
      {!data ? <div className="offline-center-loading"><RefreshCw className="offline-spin" size={26} /><strong>Loading server evidence…</strong></div> : tab === 'overview' ? <main className="offline-center-body">
        <section className="offline-center-kpis"><article><small>Active sessions</small><strong>{data.summary.activeSessions}</strong><span>Live server session check</span></article><article><small>Reported pending</small><strong>{data.summary.reportedPending}</strong><span>Client-reported, not live while offline</span></article><article><small>Devices reporting</small><strong>{data.summary.telemetryDevices}</strong><span>Application-scoped IDs</span></article><article className={data.summary.needsAttention ? 'warn' : ''}><small>Needs attention</small><strong>{data.summary.needsAttention}</strong><span>Conflicts or rejected receipts</span></article></section>
        <section className="offline-center-grid"><article className="offline-center-card"><header><Laptop size={17} /><div><strong>Recent device health</strong><small>Network location is coarse request metadata. It is not GPS.</small></div></header>{data.telemetry.length ? data.telemetry.slice(0, 8).map((item) => <div className="offline-device-row" key={item.employeeId + item.deviceId}><span className="offline-device-icon">{statusIcon(item.syncStatus)}</span><div><strong>{item.employeeName}</strong><small>{item.deviceName || 'Browser'} · {item.platform || 'web'} · {item.appVersion || 'build not reported'}</small><small>{item.ipAddress || 'IP unavailable'} · {item.networkLocation || 'Network location unavailable'}</small></div><aside><b>{item.syncStatus?.replaceAll('_', ' ') || 'unknown'}</b><small>{freshness(item.lastReportedAt)}</small><button className="offline-detail-link" onClick={() => void openDetail({ ...emptyFilters, employeeId: item.employeeId, deviceId: item.deviceId, companyId: item.companyId || '' })}>Inspect</button></aside></div>) : <div className="offline-center-empty">No client telemetry has been reported yet.</div>}</article>
          <article className="offline-center-card"><header><LockKeyhole size={17} /><div><strong>Policy guardrails</strong><small>Policy never extends an employee’s live session or permission scope.</small></div></header>{policy && <form className="offline-policy-form" onSubmit={savePolicy}><label><span>Maximum offline age (minutes)</span><input type="number" min="5" max="43200" value={policy.maxOfflineAgeMinutes} onChange={(event) => setPolicy({ ...policy, maxOfflineAgeMinutes: Number(event.target.value) })} /></label><label><span>Maximum queued items</span><input type="number" min="1" max="500" value={policy.maxQueueCount} onChange={(event) => setPolicy({ ...policy, maxQueueCount: Number(event.target.value) })} /></label><label><span>Attachment limit (bytes)</span><input type="number" min="1024" max="52428800" value={policy.attachmentMaxBytes} onChange={(event) => setPolicy({ ...policy, attachmentMaxBytes: Number(event.target.value) })} /></label><label className="offline-policy-check"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy({ ...policy, enabled: event.target.checked })} /><span>Platform enabled</span></label><label className="offline-policy-check"><input type="checkbox" checked={policy.automaticSync} onChange={(event) => setPolicy({ ...policy, automaticSync: event.target.checked })} /><span>Automatic sync enabled</span></label><button className="offline-center-primary" disabled={busy}>Save policy</button></form>}</article></section>
        <section className="offline-center-card offline-center-explain"><header><UserRound size={17} /><div><strong>Privacy and freshness</strong><small>What this view can and cannot know</small></div></header><p>Each device receives a random application-scoped device ID. Server-observed IP and Cloudflare’s coarse network location are recorded separately from any user-consented GPS capture. An offline device cannot report live health; the last reported time is shown above. Revoking a session prevents its cookie from authenticating and stops queued mutations from flushing.</p></section>
      </main> : tab === 'sessions' ? <main className="offline-center-body"><section className="offline-center-card"><header><Laptop size={17} /><div><strong>Active and recent sessions</strong><small>No passwords, cookies or session tokens are displayed.</small></div></header><div className="offline-session-list">{data.sessions.length ? data.sessions.map((session) => { const active = !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now(); return <article key={session.id}><span className={active ? 'session-live' : 'session-closed'}>{active ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}</span><div><strong>{session.employeeName}</strong><small>{session.deviceName || 'Browser session'} · {session.platform || 'web'} · {session.deviceId || 'device ID unavailable'}</small><small>{session.ipAddress || 'IP unavailable'} · Network location: {session.networkLocation || 'not reported'} · {session.clientTimezone || 'timezone not reported'}</small><small>Created {formatAt(session.createdAt, data.businessTimezone, 'business', viewerZone)} · last seen {formatAt(session.lastSeenAt, data.businessTimezone, 'business', viewerZone)} · expires {formatAt(session.expiresAt, data.businessTimezone, 'business', viewerZone)}</small></div><aside><b>{active ? 'Active' : session.revokedAt ? 'Revoked' : 'Expired'}</b><button className="offline-detail-link" onClick={() => void openDetail({ ...emptyFilters, employeeId: session.employeeId, deviceId: session.deviceId || '', sessionId: session.id, companyId: session.companyId || '' })}>Inspect</button>{active && <button disabled={busy} onClick={() => void revoke(session)}>Revoke</button>}</aside></article>; }) : <div className="offline-center-empty">No sessions found.</div>}</div></section></main> : tab === 'activity' ? <main className="offline-center-body"><section className="offline-center-card"><header><Cloud size={17} /><div><strong>Sync receipts</strong><small>Server results are immutable evidence; conflicts remain visible for review.</small></div></header><div className="offline-receipt-list">{data.receipts.length ? data.receipts.map((receipt) => <article key={receipt.id}><span className={receipt.state === 'completed' ? 'receipt-good' : receipt.state === 'conflict' ? 'receipt-warn' : 'receipt-bad'}>{receipt.state === 'completed' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span><div><strong>{receipt.employeeName} · Forms submission</strong><small>{receipt.state.replaceAll('_', ' ')} · {receipt.attemptCount} attempt{receipt.attemptCount === 1 ? '' : 's'} · {receipt.lastErrorCategory || 'no error category'}</small><small>Received {formatAt(receipt.serverReceivedAt, data.businessTimezone, 'business', viewerZone)} · updated {formatAt(receipt.updatedAt, data.businessTimezone, 'business', viewerZone)}</small></div><aside><button className="offline-detail-link" onClick={() => void openDetail({ ...emptyFilters, employeeId: receipt.employeeId, companyId: receipt.companyId || '' })}>Inspect</button></aside></article>) : <div className="offline-center-empty">No sync receipts found.</div>}</div></section></main> : <main className="offline-center-body offline-detail-body">
        <section className="offline-detail-toolbar"><div><strong>Detailed evidence</strong><small>Only recorded server evidence is shown. Missing stages are not invented.</small></div><label><span>Timestamp view</span><select value={timeMode} onChange={(event) => setTimeMode(event.target.value as TimeMode)}><option value="both">Show Both</option><option value="business">Business Time</option><option value="viewer">My Time</option><option value="utc">UTC</option></select></label></section>
        <section className="offline-detail-filter-grid"><label><span>Employee</span><select value={filters.employeeId} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value, deviceId: '', sessionId: '' })}><option value="">Select employee</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><label><span>Session/device</span><input value={filters.deviceId} placeholder="Device ID" onChange={(event) => setFilters({ ...filters, deviceId: event.target.value })} /></label><label><span>Session ID</span><input value={filters.sessionId} placeholder="Session ID" onChange={(event) => setFilters({ ...filters, sessionId: event.target.value })} /></label><label><span>State</span><select value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })}><option value="">All states</option><option value="completed">Completed</option><option value="processing">Processing</option><option value="conflict">Conflict</option><option value="rejected">Rejected</option><option value="failed_retryable">Retryable failure</option></select></label><label><span>Event/action</span><input value={filters.eventType} placeholder="e.g. sync_started" onChange={(event) => setFilters({ ...filters, eventType: event.target.value })} /></label><label><span>Company</span><select value={filters.companyId} onChange={(event) => setFilters({ ...filters, companyId: event.target.value })}><option value="">All assigned companies</option>{context.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label><span>From</span><input type="datetime-local" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label><label><span>To</span><input type="datetime-local" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label><button className="offline-center-primary" disabled={detailBusy || !filters.employeeId} onClick={() => void openDetail(filters)}>Apply filters</button></section>
        {detailBusy ? <div className="offline-center-loading"><RefreshCw className="offline-spin" size={24} /><strong>Loading detailed evidence…</strong></div> : detail ? <>
          <section className="offline-detail-identity"><div><small>EMPLOYEE</small><h3>{detail.employee.displayName}</h3><p>{detail.employee.employeeNo || 'Employee number not recorded'} · {detail.employee.id}</p><p>{detail.employee.jobTitle || 'Role not recorded'} · {detail.employee.department || 'Department not recorded'}</p></div><div><small>COMPANY / BRANCH CONTEXT</small><p>{detail.memberships.length ? detail.memberships.map((item) => `${item.companyName}${item.locationName ? ` · ${item.locationName}` : ''}`).join(' · ') : 'No membership context recorded'}</p><p>{detail.roles.length ? detail.roles.map((role) => role.name).join(' · ') : 'No role context recorded'}</p></div></section>
          <section className="offline-detail-meta-grid"><article className="offline-center-card"><header><Laptop size={17} /><div><strong>Sessions and devices</strong><small>Application device IDs and session state only.</small></div></header>{detail.sessions.length ? detail.sessions.map((session) => <div className="offline-detail-session" key={session.id}><strong>{session.deviceName || 'Browser session'} · {session.deviceId || 'device ID unavailable'}</strong><span>Session {session.id}</span><span>{session.platform || 'web'} · {session.userAgent || 'browser metadata unavailable'} · build {session.appVersion || 'not reported'}</span><span>Created {formatAt(session.createdAt, detail.businessTimezone, timeMode, viewerZone)}</span><span>Last seen {formatAt(session.lastSeenAt, detail.businessTimezone, timeMode, viewerZone)} · expires {formatAt(session.expiresAt, detail.businessTimezone, timeMode, viewerZone)}</span><b className={session.revokedAt ? 'offline-detail-negative' : 'offline-detail-positive'}>{session.revokedAt ? `Revoked ${formatAt(session.revokedAt, detail.businessTimezone, timeMode, viewerZone)}` : 'Not revoked'}</b></div>) : <div className="offline-center-empty">No session evidence recorded.</div>}</article><article className="offline-center-card"><header><Cloud size={17} /><div><strong>Network and telemetry</strong><small>Network location is not GPS. Reports can be stale while a device is offline.</small></div></header>{detail.telemetry.length ? detail.telemetry.map((item) => <div className="offline-detail-session" key={item.deviceId + item.companyId}><strong>{item.deviceName || 'Browser'} · {item.syncStatus || 'status not reported'}</strong><span>Server-observed IP: {item.ipAddress || 'not recorded'}</span><span>Network location: {item.networkLocation || 'not recorded'} · not GPS</span><span>Device timezone: {item.clientTimezone || 'not recorded'} · {freshness(item.lastReportedAt)}</span><span>Last successful sync: {formatAt(item.lastSuccessfulSyncAt, detail.businessTimezone, timeMode, viewerZone)}</span></div>) : <div className="offline-center-empty">No telemetry evidence recorded.</div>}</article></section>
          {detailServerAt && <section className="offline-center-card offline-detail-clock-card"><header><Cloud size={17} /><div><strong>Time evidence</strong><small>Daenem business time: Africa/Lagos (WAT). Server time is authoritative for processing; device time remains preserved as evidence.</small></div></header><div className="offline-detail-clock-grid"><span>Device captured</span><b>{formatAt(detailCaptured?.captured, detail.businessTimezone, 'business', viewerZone)} · {String(detail.audit.find((row) => row.details?.clientTimezone)?.details?.clientTimezone || 'device timezone not reported')}</b><span>Server received</span><b>{formatAt(detailServerAt, detail.businessTimezone, 'business', viewerZone)}</b><span>Owner/viewer</span><b>{formatAt(detailServerAt, detail.businessTimezone, 'viewer', viewerZone)} · {viewerZone}</b><span>UTC canonical</span><b>{formatAt(detailServerAt, detail.businessTimezone, 'utc', viewerZone)}</b></div>{drift && <p className="offline-detail-drift">{drift}</p>}</section>}
          <section className="offline-center-card offline-detail-timeline"><header><Cloud size={17} /><div><strong>Operational timeline</strong><small>Chronological audit and receipt evidence; raw payloads and secrets are excluded.</small></div></header>{detail.timeline.length ? <ol>{detail.timeline.map((item) => <li key={item.id}><time>{formatAt(item.at, detail.businessTimezone, timeMode, viewerZone)}</time><div><strong>{item.title}</strong><small>{item.action || item.category}{item.entityType ? ` · ${item.entityType}` : ''}{item.entityId ? ` · ${item.entityId}` : ''}</small>{item.requestId && <small>Request/correlation ID: {item.requestId}</small>}{renderSafeDetails(item.details)}</div></li>)}</ol> : <div className="offline-center-empty">No recorded timeline events match these filters.</div>}</section>
          <section className="offline-detail-meta-grid"><article className="offline-center-card"><header><CheckCircle2 size={17} /><div><strong>Sync receipts</strong><small>Immutable server receipts and safe outcomes.</small></div></header>{detail.receipts.length ? detail.receipts.map((receipt) => <div className="offline-detail-session" key={receipt.id}><strong>{receipt.operationKind} · {receipt.state.replaceAll('_', ' ')}</strong><span>Operation {receipt.operationId} · idempotency {receipt.idempotencyKey || 'not returned'}</span><span>{receipt.outcome || 'Outcome not recorded'} · {receipt.attemptCount} attempt{receipt.attemptCount === 1 ? '' : 's'}</span><span>Server received {formatAt(receipt.serverReceivedAt, detail.businessTimezone, timeMode, viewerZone)} · completed {formatAt(receipt.completedAt, detail.businessTimezone, timeMode, viewerZone)}</span></div>) : <div className="offline-center-empty">No receipt evidence recorded.</div>}</article><article className="offline-center-card"><header><ShieldCheck size={17} /><div><strong>Attachment evidence</strong><small>Metadata and integrity only; file bodies are never shown.</small></div></header>{detail.attachments.length ? detail.attachments.map((attachment) => <div className="offline-detail-session" key={attachment.id}><strong>{attachment.originalName} · {attachment.status}</strong><span>{attachment.id} · {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</span><span>SHA-256: {attachment.sha256} · integrity recorded</span><span>Uploaded {formatAt(attachment.uploadedAt, detail.businessTimezone, timeMode, viewerZone)}</span></div>) : <div className="offline-center-empty">No attachment evidence recorded.</div>}</article></section>
        </> : <div className="offline-center-empty offline-detail-prompt">Select an employee, session/device, or receipt to open detailed evidence.</div>}
      </main>}
      <footer className="offline-center-footer"><span>Daenem business time: Africa/Lagos (WAT). Network location is not GPS.</span><span>Owner authorization is checked again by every control endpoint.</span></footer>
    </section>
  </div>;
}

const host = document.createElement('div');
host.id = 'daenem-offline-sync-center-root';
document.body.appendChild(host);
import('react-dom/client').then(({ createRoot }) => createRoot(host).render(<Launcher />));
