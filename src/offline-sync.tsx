import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle, CheckCircle2, Cloud, CloudOff, LoaderCircle, LockKeyhole, RefreshCw, UploadCloud, Wifi,
  X,
} from 'lucide-react';
import type { WorkforceContext } from './auth';
import {
  initOfflinePlatform,
  listOfflineOperations,
  readFormsDraft,
  queueFormsSubmission,
  registerOfflineBackgroundSync,
  saveCachedAuthContext,
  saveFormsDraft,
  syncQueuedOperations,
  type FormsDraftInput,
  type OfflineBootstrap,
  type OfflineIdentity,
  type OfflineOperation,
  type OfflineOperationState,
  watchOfflineChanges,
} from './offline-platform';
import './offline-sync.css';

type SyncStatus = 'online' | 'offline' | 'waiting' | 'syncing' | 'synced' | 'needs-attention' | 'authentication-required';

type OfflineContextValue = {
  status: SyncStatus;
  online: boolean;
  operations: OfflineOperation[];
  waitingCount: number;
  needsAttentionCount: number;
  lastSuccessfulSync: string | null;
  queueFormsDraft: (input: FormsDraftInput, companyId?: string) => Promise<OfflineOperation>;
  queueFormsSubmission: (input: FormsDraftInput, companyId?: string) => Promise<OfflineOperation>;
  readFormsDraft: (assignmentId: string, companyId?: string) => Promise<{ operationId: string; responses: Record<string, unknown>; state: string } | null>;
  retryNow: () => Promise<void>;
  openActivity: () => void;
};

const defaultValue: OfflineContextValue = {
  status: 'online',
  online: true,
  operations: [],
  waitingCount: 0,
  needsAttentionCount: 0,
  lastSuccessfulSync: null,
  queueFormsDraft: async () => { throw new Error('Offline platform is not ready.'); },
  queueFormsSubmission: async () => { throw new Error('Offline platform is not ready.'); },
  readFormsDraft: async () => null,
  retryNow: async () => undefined,
  openActivity: () => undefined,
};

const OfflineContext = createContext<OfflineContextValue>(defaultValue);

function identityFor(context: WorkforceContext, companyId?: string): OfflineIdentity {
  const candidate = companyId && context.companies.some((company) => company.id === companyId)
    ? companyId
    : context.companies.find((company) => company.primary)?.id || context.companies[0]?.id || 'group';
  return { employeeId: context.employee.id, companyId: candidate };
}

function identitiesFor(context: WorkforceContext) {
  const ids = context.companies.map((company) => ({ employeeId: context.employee.id, companyId: company.id }));
  return ids.length ? ids : [identityFor(context)];
}

async function requestJson<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { ...options, credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(String(body.error || 'The sync service is unavailable.')) as Error & { status?: number; body?: Record<string, unknown> };
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body as T;
}

function deviceInfo() {
  let deviceId = '';
  try { deviceId = localStorage.getItem('daenem-workforce-device-id') || ''; } catch { deviceId = ''; }
  if (!deviceId) {
    deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'device-' + Date.now().toString(36);
    try { localStorage.setItem('daenem-workforce-device-id', deviceId); } catch { /* The queue never depends on localStorage. */ }
  }
  return {
    deviceId,
    deviceName: (navigator.platform || 'Device') + ' · ' + (navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Browser'),
    platform: navigator.platform || 'web',
  };
}

function isPending(state: OfflineOperationState) {
  return ['waiting-to-sync', 'syncing', 'failed-retryable', 'authentication-required'].includes(state);
}

function isNeedsAttention(state: OfflineOperationState) {
  return ['needs-review', 'failed-terminal'].includes(state);
}

function formatTime(value?: string | null, timeZone?: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(date);
}

function statusLabel(status: SyncStatus, waiting: number, needs: number) {
  if (status === 'offline') return waiting ? 'Offline · ' + waiting + ' change' + (waiting === 1 ? '' : 's') + ' waiting' : 'Offline';
  if (status === 'syncing') return 'Syncing ' + waiting + ' item' + (waiting === 1 ? '' : 's') + '…';
  if (status === 'waiting') return waiting + ' change' + (waiting === 1 ? '' : 's') + ' waiting to sync';
  if (status === 'needs-attention') return needs + ' item' + (needs === 1 ? '' : 's') + ' needs attention';
  if (status === 'authentication-required') return 'Sign in to continue syncing';
  if (status === 'synced') return 'All work synced';
  return 'Online';
}

function statusIcon(status: SyncStatus) {
  if (status === 'offline') return <CloudOff size={15} aria-hidden="true" />;
  if (status === 'syncing') return <LoaderCircle className="offline-spin" size={15} aria-hidden="true" />;
  if (status === 'waiting') return <UploadCloud size={15} aria-hidden="true" />;
  if (status === 'needs-attention') return <AlertCircle size={15} aria-hidden="true" />;
  if (status === 'authentication-required') return <LockKeyhole size={15} aria-hidden="true" />;
  if (status === 'synced') return <CheckCircle2 size={15} aria-hidden="true" />;
  return <Wifi size={15} aria-hidden="true" />;
}

export function OfflinePlatformProvider({ context, children }: { context: WorkforceContext; children: ReactNode }) {
  const identities = useMemo(() => identitiesFor(context), [context]);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [status, setStatus] = useState<SyncStatus>(() => (typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'));
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const syncInFlight = useRef(false);
  const mounted = useRef(true);
  const lastTelemetryAt = useRef(0);
  const onlineRef = useRef(online);
  const lastSuccessfulRef = useRef(lastSuccessfulSync);
  const bootstrapByCompany = useRef(new Map<string, OfflineBootstrap>());
  const manualRetryQueued = useRef(false);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { lastSuccessfulRef.current = lastSuccessfulSync; }, [lastSuccessfulSync]);

  const refreshOperations = useCallback(async () => {
    try {
      const lists = await Promise.all(identities.map((identity) => listOfflineOperations(identity)));
      if (!mounted.current) return [];
      const next = lists.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setOperations(next);
      const receiptTimes = next
        .filter((item) => item.state === 'synced')
        .map((item) => item.serverReceipt?.completedAt || item.serverReceipt?.serverReceivedAt)
        .filter(Boolean) as string[];
      if (receiptTimes.length) setLastSuccessfulSync(receiptTimes.sort().at(-1) || null);
      return next;
    } catch {
      return [];
    }
  }, [identities]);

  const sendTelemetry = useCallback(async (nextStatus: SyncStatus, nextOperations: OfflineOperation[], successfulAt?: string) => {
    if (!onlineRef.current || Date.now() - lastTelemetryAt.current < 30_000) return;
    lastTelemetryAt.current = Date.now();
    const device = deviceInfo();
    const lastError = nextOperations.find((item) => item.lastErrorCategory)?.lastErrorCategory;
    const lastSuccess = successfulAt || lastSuccessfulRef.current || undefined;
    await Promise.all(identities.slice(0, 5).map((identity) => requestJson('/api/offline/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyId: identity.companyId,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        platform: device.platform,
        appVersion: document.querySelector('meta[name="daenem-build"]')?.getAttribute('content') || 'staffportal',
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        pendingCount: nextOperations.filter((item) => item.companyId === identity.companyId && isPending(item.state)).length,
        syncStatus: nextStatus.replace('-', '_'),
        lastSuccessfulSyncAt: lastSuccess,
        lastFailedSyncAt: lastError ? new Date().toISOString() : undefined,
        lastErrorCategory: lastError,
      }),
    }).catch(() => undefined)));
  }, [identities]);

  const syncNow = useCallback(async (ignoreBackoff = false) => {
    if (syncInFlight.current) {
      if (ignoreBackoff) manualRetryQueued.current = true;
      return;
    }
    if (!navigator.onLine) {
      setOnline(false);
      setStatus('offline');
      return;
    }
    syncInFlight.current = true;
    setOnline(true);
    setStatus('syncing');
    try {
      let syncedCount = 0;
      let authenticationRequired = false;
      for (const identity of identities) {
        try {
          const bootstrap = await requestJson<OfflineBootstrap>('/api/offline/bootstrap?companyId=' + encodeURIComponent(identity.companyId));
          bootstrapByCompany.current.set(identity.companyId, bootstrap);
          await saveCachedAuthContext(context, bootstrap);
          await registerOfflineBackgroundSync();
          const result = await syncQueuedOperations(identity, { ignoreBackoff });
          syncedCount += result.synced;
          if (result.authRequired > 0) authenticationRequired = true;
        } catch (error) {
          if ((error as { status?: number }).status === 401) authenticationRequired = true;
        }
      }
      const next = await refreshOperations();
      const waiting = next.filter((item) => isPending(item.state)).length;
      const needs = next.filter((item) => isNeedsAttention(item.state)).length;
      if (authenticationRequired) setStatus('authentication-required');
      else if (needs) setStatus('needs-attention');
      else if (waiting) setStatus('waiting');
      else if (syncedCount || next.some((item) => item.state === 'synced')) {
        const completed = new Date().toISOString();
        setLastSuccessfulSync((current) => current || completed);
        setStatus('synced');
      } else setStatus('online');
      await sendTelemetry(needs ? 'needs-attention' : waiting ? 'waiting' : syncedCount ? 'synced' : 'online', next, syncedCount ? new Date().toISOString() : undefined);
    } catch (error) {
      if (!navigator.onLine) {
        setOnline(false);
        setStatus('offline');
      } else if ((error as { status?: number }).status === 401) {
        setStatus('authentication-required');
      } else {
        setStatus('online');
      }
    } finally {
      syncInFlight.current = false;
      if (manualRetryQueued.current && navigator.onLine) {
        manualRetryQueued.current = false;
        window.setTimeout(() => void syncNow(true), 0);
      }
    }
  }, [context, identities, refreshOperations, sendTelemetry]);

  useEffect(() => {
    mounted.current = true;
    initOfflinePlatform();
    void refreshOperations().then(() => {
      // A reload can briefly rehydrate the authenticated shell while the
      // browser is still disconnected. Reassert the offline state after the
      // durable queue has been read so a stale online/syncing label cannot
      // appear during offline continuation.
      if (!navigator.onLine) {
        setOnline(false);
        setStatus('offline');
        return;
      }
      void syncNow();
    });
    const onOnline = () => {
      setOnline(true);
      window.setTimeout(() => void syncNow(), 0);
    };
    const onOffline = () => {
      setOnline(false);
      setStatus('offline');
      void refreshOperations();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void syncNow();
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'daenem-offline-sync' && navigator.onLine) void syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    const stopWatching = watchOfflineChanges(() => { void refreshOperations(); });
    return () => {
      mounted.current = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
      stopWatching();
    };
  }, [refreshOperations, syncNow]);

  const queueDraft = useCallback(async (input: FormsDraftInput, companyId?: string) => {
    const identity = identityFor(context, companyId);
    const current = await refreshOperations();
    const policy = bootstrapByCompany.current.get(identity.companyId)?.policy;
    const activeCount = current.filter((item) => item.state !== 'synced' && item.state !== 'local-draft').length;
    if (policy && activeCount >= policy.maxQueueCount) throw new Error('Your offline queue is full. Retry existing work before adding another submission.');
    const result = await saveFormsDraft(identity, input);
    await refreshOperations();
    await registerOfflineBackgroundSync();
    return result;
  }, [context, refreshOperations]);

  const queueSubmission = useCallback(async (input: FormsDraftInput, companyId?: string) => {
    if (!input.supportedForOfflineSubmit) throw new Error('This form is saved as a local draft because it requires a live connection.');
    const identity = identityFor(context, companyId);
    const current = await refreshOperations();
    const policy = bootstrapByCompany.current.get(identity.companyId)?.policy;
    const activeCount = current.filter((item) => item.state !== 'synced' && item.state !== 'local-draft').length;
    if (policy && activeCount >= policy.maxQueueCount) throw new Error('Your offline queue is full. Retry existing work before adding another submission.');
    const result = await queueFormsSubmission(identity, input);
    const next = await refreshOperations();
    setStatus(navigator.onLine ? 'waiting' : 'offline');
    await sendTelemetry(navigator.onLine ? 'waiting' : 'offline', next);
    await registerOfflineBackgroundSync();
    return result;
  }, [context, refreshOperations, sendTelemetry]);

  const readDraft = useCallback(async (assignmentId: string, companyId?: string) => {
    return readFormsDraft(identityFor(context, companyId), assignmentId);
  }, [context]);

  const waitingCount = operations.filter((item) => isPending(item.state)).length;
  const needsAttentionCount = operations.filter((item) => isNeedsAttention(item.state)).length;
  const value = useMemo<OfflineContextValue>(() => ({
    status,
    online,
    operations,
    waitingCount,
    needsAttentionCount,
    lastSuccessfulSync,
    queueFormsDraft: queueDraft,
    queueFormsSubmission: queueSubmission,
    readFormsDraft: readDraft,
    retryNow: () => syncNow(true),
    openActivity: () => setActivityOpen(true),
  }), [lastSuccessfulSync, needsAttentionCount, online, operations, queueDraft, queueSubmission, readDraft, status, syncNow, waitingCount]);

  return <OfflineContext.Provider value={value}>
    {children}
    {activityOpen && <SyncActivitySheet onClose={() => setActivityOpen(false)} />}
  </OfflineContext.Provider>;
}

export function useOfflinePlatform() {
  return useContext(OfflineContext);
}

export function OfflineSyncIndicator() {
  const { status, waitingCount, needsAttentionCount, openActivity } = useOfflinePlatform();
  return <button
    type="button"
    className={'offline-sync-indicator offline-sync-' + status}
    onClick={openActivity}
    aria-label={statusLabel(status, waitingCount, needsAttentionCount) + '. Open My Sync Activity'}
    data-offline-sync-indicator="true"
    data-sync-status={status}
  >
    {statusIcon(status)}
    <span aria-live="polite">{statusLabel(status, waitingCount, needsAttentionCount)}</span>
  </button>;
}

function SyncActivitySheet({ onClose }: { onClose: () => void }) {
  const { operations, status, waitingCount, needsAttentionCount, retryNow } = useOfflinePlatform();
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try { await retryNow(); } finally { setRetrying(false); }
  }
  return <div className="offline-sheet-backdrop" onClick={onClose}>
    <section className="offline-sheet" role="dialog" aria-modal="true" aria-labelledby="offline-activity-title" onClick={(event) => event.stopPropagation()}>
      <header>
        <div><span className="eyebrow">PRIVATE TO THIS ACCOUNT</span><h2 id="offline-activity-title">My Sync Activity</h2><p>Offline work is kept in encrypted browser storage for this employee and scope. Reconnect triggers permission and server-state validation before submission.</p></div>
        <button type="button" className="offline-close" onClick={onClose} aria-label="Close My Sync Activity"><X size={18} /></button>
      </header>
      <div className="offline-activity-summary" aria-live="polite"><span>{statusIcon(status)} {statusLabel(status, waitingCount, needsAttentionCount)}</span><button type="button" onClick={() => void retry()} disabled={retrying || status === 'offline'}><RefreshCw size={14} className={retrying ? 'offline-spin' : ''} /> {retrying ? 'Retrying…' : 'Retry Now'}</button></div>
      <div className="offline-activity-note"><Cloud size={17} /><span>Captured on device is evidence. Server received time is authoritative and shown in Daenem business time (Africa/Lagos) when available.</span></div>
      <main className="offline-activity-list">
        {operations.length === 0 ? <div className="offline-empty"><CheckCircle2 size={28} /><strong>No queued sync activity</strong><span>Supported Forms work will appear here after you save or submit it offline.</span></div> : operations.map((operation) => <article className={'offline-activity-row state-' + operation.state} key={operation.id}>
          <div className="offline-row-icon">{operation.state === 'synced' ? <CheckCircle2 size={17} /> : isNeedsAttention(operation.state) ? <AlertCircle size={17} /> : operation.state === 'authentication-required' ? <LockKeyhole size={17} /> : <UploadCloud size={17} />}</div>
          <div><strong>Forms submission</strong><span>{operation.state.replaceAll('-', ' ')} · {operation.attemptCount} attempt{operation.attemptCount === 1 ? '' : 's'}</span>{operation.lastErrorMessage && <small>{operation.lastErrorMessage}</small>}<small>Captured on device · {formatTime(operation.capturedAt, operation.clientTimezone)}</small>{operation.serverReceipt?.serverReceivedAt && <small>Received by server · {formatTime(String(operation.serverReceipt.serverReceivedAt), 'Africa/Lagos')}</small>}</div>
          <time>{formatTime(operation.updatedAt)}</time>
        </article>)}
      </main>
      <footer><span>Only your own permitted operations are shown. No passwords, tokens or file bodies are stored in this activity view.</span></footer>
    </section>
  </div>;
}
