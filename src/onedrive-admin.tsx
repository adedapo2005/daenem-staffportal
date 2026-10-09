import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, Database, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, type WorkforceContext } from './auth';
import './onedrive-admin.css';

type MirrorConfig = {
  provider: string; configured: boolean; applicationConfigurationPresent: boolean;
  authorizationEnabled: boolean; liveTransferEnabled: boolean;
  setupStatus: string; updatedAt: string | null;
};
type MirrorHealth = {
  primaryStorage: string; provider: string; providerStatus: string; syncHealth: string;
  pendingCount: number; failedCount: number; lastSuccessfulSync: string | null;
  liveAuthorizationEnabled: boolean;
  counts: Record<string, number>;
};
type MirrorJob = {
  id: string; sourceModule: string; status: string; attemptCount: number;
  lastErrorCode: string | null; nextAttemptAt: string | null;
  createdAt: string; updatedAt: string; syncedAt: string | null;
};
type Snapshot = { config: MirrorConfig; health: MirrorHealth; jobs: MirrorJob[] };

function isStorageAdmin(context: WorkforceContext) {
  return context.roles.some((role) => role.code === 'owner' || role.code === 'group_admin');
}

function authorizationIdentity(context: WorkforceContext) {
  return JSON.stringify([
    context.sessionId, context.employee.id, context.employee.status,
    context.roles.map((role) => [role.id, role.code, role.companyId]).sort(),
    context.companies.map((company) => company.id).sort(),
  ]);
}

async function verifyFresh(expectedIdentity: string) {
  const response = await fetch('/api/auth/me', {
    method: 'GET', credentials: 'include', cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error('Authorization could not be verified.');
  const result = await response.json() as { authenticated?: boolean; context?: WorkforceContext };
  if (!result.authenticated || !result.context || !isStorageAdmin(result.context) ||
      authorizationIdentity(result.context) !== expectedIdentity) {
    throw new Error('Authorization could not be verified.');
  }
}

function timestamp(value: string | null | undefined) {
  if (!value) return 'Not Yet Available';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos', hour12: true,
      }).format(date) + ' WAT'
    : 'Not Yet Available';
}

function count(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? String(value) : 'Unavailable';
}

function statusName(value: string) {
  const names: Record<string, string> = {
    provider_required: 'Provider Required', backup_pending: 'Backup Pending',
    attention_required: 'Attention Required', no_uploads: 'No Uploads',
    pending: 'Pending', retrying: 'Retrying', syncing: 'Syncing',
    mirrored: 'Mirrored', failed: 'Failed', disabled: 'Disabled',
  };
  return names[value] || 'Status Unavailable';
}

export function OneDriveAdmin({ context }: { context: WorkforceContext }) {
  const identity = useMemo(() => authorizationIdentity(context), [context]);
  const canOpen = isStorageAdmin(context);
  const generation = useRef(0);
  const [access, setAccess] = useState<'verifying' | 'granted' | 'denied'>('verifying');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [notice, setNotice] = useState('');
  const [retrying, setRetrying] = useState('');

  const invalidate = useCallback(() => {
    generation.current += 1;
    setAccess('denied');
    setSnapshot(null);
    setNotice('');
    setRetrying('');
  }, []);

  const refresh = useCallback(async () => {
    const run = ++generation.current;
    setAccess('verifying');
    setSnapshot(null);
    setNotice('');
    if (!canOpen) {
      setAccess('denied');
      return;
    }
    try {
      await verifyFresh(identity);
      if (run !== generation.current) return;
      const [config, health, jobsResult] = await Promise.all([
        api<MirrorConfig>('/api/admin/storage/onedrive/config'),
        api<MirrorHealth>('/api/admin/storage/mirror-health'),
        api<{ jobs: MirrorJob[] }>('/api/admin/storage/mirror-jobs?limit=50'),
      ]);
      await verifyFresh(identity);
      if (run !== generation.current) return;
      setSnapshot({ config, health, jobs: Array.isArray(jobsResult.jobs) ? jobsResult.jobs : [] });
      setAccess('granted');
    } catch {
      if (run !== generation.current) return;
      setSnapshot(null);
      setAccess('denied');
    }
  }, [canOpen, identity]);

  useEffect(() => {
    void refresh();
    const changed = () => invalidate();
    const focus = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('daenem-auth-changed', changed);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    return () => {
      generation.current += 1;
      window.removeEventListener('daenem-auth-changed', changed);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, invalidate]);

  const retry = async (job: MirrorJob) => {
    if (access !== 'granted' || !snapshot || job.status !== 'failed' || retrying) return;
    if (!window.confirm('Queue a retry for this failed backup job? This does not authorize a live Microsoft connection.')) return;
    const run = ++generation.current;
    setRetrying(job.id);
    setSnapshot(null);
    setAccess('verifying');
    try {
      await verifyFresh(identity);
      if (run !== generation.current) return;
      const result = await api<{ ok: boolean; queuedForRetry: number }>('/api/admin/storage/mirror-retry', {
        method: 'POST',
        body: JSON.stringify({ jobIds: [job.id] }),
      });
      await verifyFresh(identity);
      if (run !== generation.current) return;
      await refresh();
      if (run + 1 !== generation.current) return;
      setNotice(result.ok && result.queuedForRetry === 1
        ? 'Retry request queued. A successful mirror is not yet confirmed.'
        : 'The job was not eligible for retry. Refresh to see its current state.');
    } catch {
      if (run !== generation.current) return;
      setAccess('denied');
      setSnapshot(null);
    } finally {
      if (run === generation.current || run + 1 === generation.current) setRetrying('');
    }
  };

  if (!canOpen) return null;
  return <section className="admin-setup-section onedrive-admin" aria-label="Cloud Storage and Backup">
    <div className="admin-section-title">
      <Cloud size={20} aria-hidden="true" />
      <div><h3>Cloud Storage &amp; Backup</h3>
        <p>Cloudflare R2 is authoritative. Microsoft OneDrive is the asynchronous secondary copy, never the primary upload destination.</p></div>
    </div>
    {access === 'verifying' && <p role="status" className="onedrive-admin-note">Verifying storage administration access…</p>}
    {access === 'denied' && <p role="status" className="onedrive-admin-note">Storage administration data is unavailable. Sign in with an authorized Owner or Group Admin session.</p>}
    {access === 'granted' && snapshot && <>
      <div className="onedrive-admin-overview" aria-live="polite">
        <div><Database size={17} aria-hidden="true" /><span>Primary Storage</span><strong>Cloudflare R2</strong><small>Authoritative file store</small></div>
        <div><Cloud size={17} aria-hidden="true" /><span>Secondary Copy</span><strong>Microsoft OneDrive</strong><small>{snapshot.config.authorizationEnabled && snapshot.config.configured ? 'Configured' : 'Provider Required'}</small></div>
        <div><ShieldCheck size={17} aria-hidden="true" /><span>Mirror Health</span><strong>{statusName(snapshot.health.syncHealth)}</strong><small>Last Successful Sync: {timestamp(snapshot.health.lastSuccessfulSync)}</small></div>
      </div>
      <div className="onedrive-admin-actions">
        <button type="button" className="admin-secondary" onClick={() => { void refresh(); }}><RefreshCw size={15} aria-hidden="true" /> Refresh Status</button>
      </div>
      <div className="onedrive-admin-subsection">
        <h4>Connection &amp; Destination</h4>
        <p>{snapshot.config.authorizationEnabled && snapshot.config.configured
          ? 'OneDrive authorization is configured. Check the current backup status before relying on secondary copies.'
          : 'Microsoft authorization is required. Connect, reconnect, disconnect and destination selection are unavailable until the official OAuth configuration flow is enabled.'}</p>
        <p className="onedrive-admin-note">Never enter Microsoft passwords, verification codes or tokens into StaffPortal. Provider setup must use the official authorization flow.</p>
      </div>
      <div className="onedrive-admin-subsection">
        <h4>Sync Health</h4>
        <div className="onedrive-admin-counts">
          <span><strong>{count(snapshot.health.pendingCount)}</strong> Backup Pending</span>
          <span><strong>{count(snapshot.health.failedCount)}</strong> Failed</span>
          <span><strong>{count(snapshot.health.counts?.mirrored)}</strong> Mirrored</span>
          <span><strong>{count(snapshot.health.counts?.retrying)}</strong> Retrying</span>
        </div>
        <p className="onedrive-admin-note">R2 uploads may succeed even while OneDrive backup is pending. A queued retry does not mean the backup has succeeded.</p>
      </div>
      <div className="onedrive-admin-subsection">
        <h4>Retry &amp; Recovery</h4>
        {notice && <p role="status" className="onedrive-admin-note">{notice}</p>}
        {snapshot.jobs.length === 0 ? <p>No mirror jobs are available for your authorized scope.</p> :
          <div className="onedrive-admin-job-list">
            {snapshot.jobs.map((job) => <article key={job.id} className="onedrive-admin-job">
              <div><strong>{statusName(job.status)}</strong><span>{job.sourceModule || 'File Backup'}</span>
                <small>Updated: {timestamp(job.updatedAt)} · Attempts: {count(job.attemptCount)}</small>
                {job.lastErrorCode && <small>Error Code: {job.lastErrorCode}</small>}</div>
              {job.status === 'failed' && <button type="button" className="admin-secondary"
                disabled={Boolean(retrying)} onClick={() => { void retry(job); }}>
                <RotateCcw size={14} aria-hidden="true" /> Retry Failed Job</button>}
            </article>)}
          </div>}
      </div>
      <div className="onedrive-admin-subsection">
        <h4>Retention, Delete Policy &amp; Audit</h4>
        <p>R2 remains the source of truth. Retention changes, deletion synchronization, legal holds, and restore actions have no active controls until backend-governed policy and audit endpoints are available.</p>
        <p>Retry requests use the backend's audited operation. Full retention and audit history views remain an open first-release integration requirement.</p>
      </div>
    </>}
  </section>;
}
