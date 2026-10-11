import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle, CheckCircle2, Cloud, CloudOff, LoaderCircle, LockKeyhole, RefreshCw, UploadCloud, Wifi,
  X,
} from 'lucide-react';
import type { WorkforceContext } from './auth';
import { formatPortalDateTime, resolveStaffTimeZone } from './canonical-time';
import {
  initOfflinePlatform,
  listOfflineOperations,
  readFormsDraft,
  queueFormsSubmission,
  queueExpenseSubmission as queueExpenseSubmissionLocal,
  registerOfflineBackgroundSync,
  saveCachedAuthContext,
  saveFormsDraft,
  saveExpenseDraft,
  syncQueuedOperations,
  type FormsDraftInput,
  type ExpenseDraftInput,
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
  viewerTimezone: string;
  queueFormsDraft: (input: FormsDraftInput, companyId?: string) => Promise<OfflineOperation>;
  queueFormsSubmission: (input: FormsDraftInput, companyId?: string) => Promise<OfflineOperation>;
  queueExpenseDraft: (input: ExpenseDraftInput, companyId?: string) => Promise<OfflineOperation>;
  queueExpenseSubmission: (input: ExpenseDraftInput & { operationId?: string }, companyId?: string) => Promise<OfflineOperation>;
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
  viewerTimezone: 'UTC',
  queueFormsDraft: async () => { throw new Error('Offline platform is not ready.'); },
  queueFormsSubmission: async () => { throw new Error('Offline platform is not ready.'); },
  queueExpenseDraft: async () => { throw new Error('Offline platform is not ready.'); },
  queueExpenseSubmission: async () => { throw new Error('Offline platform is not ready.'); },
  readFormsDraft: async () => null,
  retryNow: async () => undefined,
  openActivity: () => undefined,
};

const OfflineContext = createContext<OfflineContextValue>(defaultValue);

function identityFor(context: WorkforceContext, companyId?: string): OfflineIdentity {
  const company = companyId
    ? context.companies.find((item) => item.id === companyId)
    : context.companies.find((item) => item.primary) || context.companies[0];
  if (!company) throw new Error('This company is not available for offline work.');
  return { employeeId: context.employee.id, companyId: company.id };
}

function identitiesFor(context: WorkforceContext) {
  return context.companies.map((company) => ({ employeeId: context.employee.id, companyId: company.id }));
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
  return formatPortalDateTime(value, timeZone) || 'Not recorded';
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

function compactStatusLabel(status: SyncStatus) {
  if (status === 'authentication-required') return 'Sign in required';
  if (status === 'needs-attention') return 'Needs attention';
  if (status === 'syncing') return 'Syncing';
  if (status === 'waiting') return 'Waiting';
  if (status === 'offline') return 'Offline';
  if (status === 'synced') return 'Synced';
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
  const scopeKey = identities.map((identity) => identity.employeeId + ':' + identity.companyId).sort().join('|');
  const previousScope = useRef(scopeKey);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [status, setStatus] = useState<SyncStatus>(() => (typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'));
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const syncInFlight = useRef(false);
  const mounted = useRef(true);
  const refreshGeneration = useRef(0);
  const operationsRef = useRef<OfflineOperation[]>([]);
  const lastTelemetryAt = useRef(0);
  const onlineRef = useRef(online);
  const lastSuccessfulRef = useRef(lastSuccessfulSync);
  const bootstrapByCompany = useRef(new Map<string, OfflineBootstrap>());
  const syncRequested = useRef(false);
  const syncRequestedIgnoreBackoff = useRef(false);
  const latestSyncNow = useRef<(ignoreBackoff?: boolean) => Promise<void>>(async () => undefined);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { lastSuccessfulRef.current = lastSuccessfulSync; }, [lastSuccessfulSync]);

  const refreshOperations = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const lists = await Promise.all(identities.map((identity) => listOfflineOperations(identity)));
      if (!mounted.current || previousScope.current !== scopeKey) return [];
      const authorizedNamespaces = new Set(identities.map((identity) => identity.employeeId + ':' + identity.companyId));
      const latestById = new Map(operationsRef.current
        .filter((item) => authorizedNamespaces.has(item.employeeId + ':' + item.companyId))
        .map((item) => [item.id, item]));
      for (const item of lists.flat()) {
        const current = latestById.get(item.id);
        if (!current || item.updatedAt >= current.updatedAt) latestById.set(item.id, item);
      }
      const next = [...latestById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      // Broadcast notifications and sync completion can cause overlapping
      // IndexedDB reads. An older read must never put a stale waiting state
      // back over a newer synced result.
      if (generation !== refreshGeneration.current) return operationsRef.current;
      operationsRef.current = next;
      setOperations(next);
      const receiptTimes = next
        .filter((item) => item.state === 'synced')
        .map((item) => item.serverReceipt?.completedAt || item.serverReceipt?.serverReceivedAt)
        .filter(Boolean) as string[];
      if (receiptTimes.length) setLastSuccessfulSync(receiptTimes.sort().at(-1) || null);
      return next;
    } catch {
      return operationsRef.current.filter((item) => identities.some((identity) => identity.employeeId === item.employeeId && identity.companyId === item.companyId));
    }
  }, [identities, scopeKey]);

  const sendTelemetry = useCallback(async (nextStatus: SyncStatus, nextOperations: OfflineOperation[], successfulAt?: string) => {
    if (previousScope.current !== scopeKey || !onlineRef.current || Date.now() - lastTelemetryAt.current < 30_000) return;
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
  }, [identities, scopeKey]);

  const syncNow = useCallback(async (ignoreBackoff = false) => {
    // A changed employee or company scope must not continue a previous queue run.
    const sameScope = () => mounted.current && previousScope.current === scopeKey;
    if (!sameScope()) return;
    if (syncInFlight.current) {
      syncRequested.current = true;
      syncRequestedIgnoreBackoff.current = syncRequestedIgnoreBackoff.current || ignoreBackoff;
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
        if (!sameScope()) return;
        try {
          const bootstrap = await requestJson<OfflineBootstrap>('/api/offline/bootstrap?companyId=' + encodeURIComponent(identity.companyId));
          if (!sameScope()) return;
          bootstrapByCompany.current.set(identity.companyId, bootstrap);
          await saveCachedAuthContext(context, bootstrap);
          if (!sameScope()) return;
          await registerOfflineBackgroundSync();
          if (!sameScope()) return;
          // An already-started network operation still requires server revocation checks.
          const result = await syncQueuedOperations(identity, { ignoreBackoff });
          if (!sameScope()) return;
          syncedCount += result.synced;
          if (result.authRequired > 0) authenticationRequired = true;
        } catch (error) {
          if (!sameScope()) return;
          if ((error as { status?: number }).status === 401) authenticationRequired = true;
        }
      }
      const next = await refreshOperations();
      if (!sameScope()) return;
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
      if (!sameScope()) return;
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
      const followUp = syncRequested.current && navigator.onLine && mounted.current;
      const followUpIgnoreBackoff = syncRequestedIgnoreBackoff.current;
      syncRequested.current = false;
      syncRequestedIgnoreBackoff.current = false;
      // Queue a current-scope refresh, never recurse into a stale auth closure.
      if (followUp) window.setTimeout(() => void latestSyncNow.current(followUpIgnoreBackoff), 0);
    }
  }, [context, identities, refreshOperations, scopeKey, sendTelemetry]);

  useEffect(() => { latestSyncNow.current = syncNow; }, [syncNow]);

  useEffect(() => {
    if (previousScope.current === scopeKey) return;
    previousScope.current = scopeKey;
    refreshGeneration.current += 1;
    operationsRef.current = [];
    bootstrapByCompany.current.clear();
    lastSuccessfulRef.current = null;
    lastTelemetryAt.current = 0;
    syncRequested.current = false;
    syncRequestedIgnoreBackoff.current = false;
    setActivityOpen(false);
    setOperations([]);
    setLastSuccessfulSync(null);
    setStatus(navigator.onLine ? 'online' : 'offline');
  }, [scopeKey]);

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

  const queueExpenseDraft = useCallback(async (input: ExpenseDraftInput, companyId?: string) => {
    const identity = identityFor(context, companyId);
    const current = await refreshOperations();
    const policy = bootstrapByCompany.current.get(identity.companyId)?.policy;
    const activeCount = current.filter((item) => item.state !== 'synced' && item.state !== 'local-draft').length;
    if (policy && activeCount >= policy.maxQueueCount) throw new Error('Your offline queue is full. Retry existing work before adding another submission.');
    const result = await saveExpenseDraft(identity, input);
    await refreshOperations();
    await registerOfflineBackgroundSync();
    return result;
  }, [context, refreshOperations]);

  const queueExpenseSubmit = useCallback(async (input: ExpenseDraftInput & { operationId?: string }, companyId?: string) => {
    const identity = identityFor(context, companyId);
    const current = await refreshOperations();
    const policy = bootstrapByCompany.current.get(identity.companyId)?.policy;
    const activeCount = current.filter((item) => item.state !== 'synced' && item.state !== 'local-draft').length;
    if (policy && activeCount >= policy.maxQueueCount) throw new Error('Your offline queue is full. Retry existing work before adding another submission.');
    const result = await queueExpenseSubmissionLocal(identity, input);
    const next = await refreshOperations();
    setStatus(navigator.onLine ? 'waiting' : 'offline');
    await sendTelemetry(navigator.onLine ? 'waiting' : 'offline', next);
    await registerOfflineBackgroundSync();
    return result;
  }, [context, refreshOperations, sendTelemetry]);

  const readDraft = useCallback(async (assignmentId: string, companyId?: string) => {
    return readFormsDraft(identityFor(context, companyId), assignmentId);
  }, [context]);

  // Scope-filter synchronously before render; an auth/company change must never
  // show the previous employee's queued titles, receipts or status counts.
  const visibleOperations = useMemo(() => {
    const permitted = new Set(identities.map((identity) => identity.employeeId + ':' + identity.companyId));
    return operations.filter((item) => permitted.has(item.employeeId + ':' + item.companyId));
  }, [identities, operations]);
  const waitingCount = visibleOperations.filter((item) => isPending(item.state)).length;
  const needsAttentionCount = visibleOperations.filter((item) => isNeedsAttention(item.state)).length;
  useEffect(() => {
    // A sibling React root may complete the shared sync lease. Once this
    // provider has refreshed the durable queue, do not leave its indicator
    // stuck on a pre-ACK waiting state.
    if (!online || waitingCount || needsAttentionCount || status === 'syncing') return;
    if (visibleOperations.some((item) => item.state === 'synced')) {
      setStatus('synced');
    }
  }, [needsAttentionCount, online, visibleOperations, status, waitingCount]);
  const safeStatus = previousScope.current === scopeKey ? status : (online ? 'online' : 'offline');
  const safeLastSuccessfulSync = previousScope.current === scopeKey ? lastSuccessfulSync : null;
  const value = useMemo<OfflineContextValue>(() => ({
    status: safeStatus,
    online,
    operations: visibleOperations,
    waitingCount,
    needsAttentionCount,
    lastSuccessfulSync: safeLastSuccessfulSync,
    viewerTimezone: resolveStaffTimeZone(context.employee.timezone),
    queueFormsDraft: queueDraft,
    queueFormsSubmission: queueSubmission,
    queueExpenseDraft,
    queueExpenseSubmission: queueExpenseSubmit,
    readFormsDraft: readDraft,
    retryNow: () => syncNow(true),
    openActivity: () => setActivityOpen(true),
  }), [context.employee.timezone, needsAttentionCount, online, queueDraft, queueExpenseDraft, queueExpenseSubmit, queueSubmission, readDraft, safeLastSuccessfulSync, safeStatus, syncNow, visibleOperations, waitingCount]);

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
  const label = statusLabel(status, waitingCount, needsAttentionCount);
  return <button
    type="button"
    className={'offline-sync-indicator offline-sync-' + status}
    onClick={openActivity}
    aria-label={label + '. Open My Sync Activity'}
    data-offline-sync-indicator="true"
    data-sync-status={status}
  >
    {statusIcon(status)}
    <span aria-live="polite"><span className="offline-sync-label-full">{label}</span><span className="offline-sync-label-compact" aria-hidden="true">{compactStatusLabel(status)}</span></span>
  </button>;
}

function SyncActivitySheet({ onClose }: { onClose: () => void }) {
  const { operations, status, waitingCount, needsAttentionCount, retryNow, viewerTimezone } = useOfflinePlatform();
  const [retrying, setRetrying] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  async function retry() {
    setRetrying(true);
    try { await retryNow(); } finally { setRetrying(false); }
  }
  return <div className="offline-sheet-backdrop" onClick={onClose}>
    <section className="offline-sheet" role="dialog" aria-modal="true" aria-labelledby="offline-activity-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter((item) => item.getClientRects().length > 0);
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header>
        <div><span className="eyebrow">PRIVATE TO THIS ACCOUNT</span><h2 id="offline-activity-title">My Sync Activity</h2><p>Offline work is kept in encrypted browser storage for this employee and scope. Reconnect triggers permission and server-state validation before submission.</p></div>
        <button ref={closeButtonRef} type="button" className="offline-close" onClick={onClose} aria-label="Close My Sync Activity"><X size={18} /></button>
      </header>
      <div className="offline-activity-summary" aria-live="polite"><span>{statusIcon(status)} {statusLabel(status, waitingCount, needsAttentionCount)}</span><button type="button" onClick={() => void retry()} disabled={retrying || status === 'offline'}><RefreshCw size={14} className={retrying ? 'offline-spin' : ''} /> {retrying ? 'Retrying…' : 'Retry Now'}</button></div>
      <div className="offline-activity-note"><Cloud size={17} /><span>Captured on device is evidence. Server received time is authoritative and shown in Daenem business time (Africa/Lagos) when available.</span></div>
      <main className="offline-activity-list">
        {operations.length === 0 ? <div className="offline-empty"><CheckCircle2 size={28} /><strong>No queued sync activity</strong><span>Supported Forms and expense work will appear here after you save or submit it offline.</span></div> : operations.map((operation) => <article className={'offline-activity-row state-' + operation.state} key={operation.id}>
          <div className="offline-row-icon">{operation.state === 'synced' ? <CheckCircle2 size={17} /> : isNeedsAttention(operation.state) ? <AlertCircle size={17} /> : operation.state === 'authentication-required' ? <LockKeyhole size={17} /> : <UploadCloud size={17} />}</div>
          <div><strong>{operation.kind === 'forms.submit' ? 'Forms submission' : operation.kind === 'expense.draft.save' ? 'Expense draft' : 'Expense request submission'}</strong><span>{operation.state.replaceAll('-', ' ')} · {operation.attemptCount} attempt{operation.attemptCount === 1 ? '' : 's'}</span>{operation.lastErrorMessage && <small>{operation.lastErrorMessage}</small>}<small>Captured on device · {formatTime(operation.capturedAt, viewerTimezone)} (your time)</small>{operation.serverReceipt?.serverReceivedAt && <small>Received by server · {formatTime(String(operation.serverReceipt.serverReceivedAt), 'Africa/Lagos')} (West Africa Time)</small>}</div>
          <time>{formatTime(operation.updatedAt, viewerTimezone)} (your time)</time>
        </article>)}
      </main>
      <footer><span>Only your own permitted operations are shown. No passwords, tokens or file bodies are stored in this activity view.</span></footer>
    </section>
  </div>;
}
