const DB_NAME = 'daenem-staff-offline-v1';
const DB_VERSION = 1;
const OPERATION_STORE = 'operations';
const ATTACHMENT_STORE = 'attachments';
const KEY_STORE = 'keys';
const META_STORE = 'meta';
const SYNC_CHANNEL = 'daenem-offline-sync-v1';
const MAX_RETRY_ATTEMPTS = 8;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
const ACTIVE_EMPLOYEE_KEY = 'daenem-offline-active-employee';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type OfflineOperationKind = 'forms.submit';
export type OfflineOperationState =
  | 'local-draft'
  | 'waiting-to-sync'
  | 'syncing'
  | 'synced'
  | 'needs-review'
  | 'failed-retryable'
  | 'failed-terminal'
  | 'authentication-required';

export type OfflineIdentity = {
  employeeId: string;
  companyId: string;
};

export type OfflineReceipt = {
  id?: string;
  operationId?: string;
  idempotencyKey?: string;
  state?: string;
  serverReceivedAt?: string;
  completedAt?: string;
  submissionId?: string;
  status?: string;
  deduplicated?: boolean;
  [key: string]: unknown;
};

export type OfflineOperation = {
  id: string;
  idempotencyKey: string;
  kind: OfflineOperationKind;
  employeeId: string;
  companyId: string;
  entityType: string;
  entityId?: string;
  capturedAt: string;
  clientTimezone: string;
  state: OfflineOperationState;
  attemptCount: number;
  nextAttemptAt?: string;
  lastAttemptedAt?: string;
  lastErrorCategory?: string;
  lastErrorMessage?: string;
  dependencyRefs: string[];
  attachmentRefs: string[];
  serverReceipt?: OfflineReceipt;
  createdAt: string;
  updatedAt: string;
};

export type OfflineBootstrap = {
  serverTime: string;
  businessTimezone: string;
  maxOfflineAgeMinutes: number;
  session: { id: string; expiresAt: string; lastVerifiedAt: string };
  policy: {
    enabled: boolean;
    maxQueueCount: number;
    attachmentMaxBytes: number;
    automaticSync: boolean;
    manualRetry: boolean;
    retentionDays: number;
    allowedOperations: OfflineOperationKind[];
  };
  operations: Array<{ kind: OfflineOperationKind; mode: 'draft-and-submit' | 'draft-only'; permission: string }>;
};

export type FormsDraftInput = {
  assignmentId: string;
  companyId: string;
  responses: Record<string, unknown>;
  supportedForOfflineSubmit: boolean;
  formTitle?: string;
  baseUpdatedAt?: string;
  attachmentRefs?: string[];
};

type EncryptedValue = {
  iv: number[];
  ciphertext: number[];
};

type StoredOperation = {
  id: string;
  namespace: string;
  idempotencyKey: string;
  kind: OfflineOperationKind;
  employeeId: string;
  companyId: string;
  entityType: string;
  entityId?: string;
  capturedAt: string;
  clientTimezone: string;
  state: OfflineOperationState;
  attemptCount: number;
  nextAttemptAt?: string;
  lastAttemptedAt?: string;
  lastErrorCategory?: string;
  lastErrorMessage?: string;
  dependencyRefs: string[];
  attachmentRefs: string[];
  serverReceipt?: OfflineReceipt;
  encryptedPayload: EncryptedValue;
  createdAt: string;
  updatedAt: string;
};

type StoredAttachment = {
  id: string;
  namespace: string;
  employeeId: string;
  companyId: string;
  operationId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  encryptedBlob: EncryptedValue;
};

type StoredKey = { id: string; cryptoKey: CryptoKey };
type StoredMeta = {
  id: string;
  kind: string;
  namespace?: string;
  verifiedAt?: string;
  sessionExpiresAt?: string;
  maxOfflineAgeMinutes?: number;
  encrypted?: EncryptedValue;
  value?: unknown;
  updatedAt: string;
  expiresAt?: string;
};

let databasePromise: Promise<IDBDatabase> | null = null;
let broadcastChannel: BroadcastChannel | null = null;

function namespaceFor(identity: OfflineIdentity) {
  return identity.employeeId + ':' + identity.companyId;
}

function strongId(prefix: string) {
  if (typeof crypto.randomUUID === 'function') return prefix + '-' + crypto.randomUUID();
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return prefix + '-' + Array.from(bytes).map((item) => item.toString(16).padStart(2, '0')).join('');
}

function requireBrowserStorage() {
  if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Secure offline storage is unavailable in this browser.');
  }
}

function openDatabase() {
  requireBrowserStorage();
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OPERATION_STORE)) {
        const store = database.createObjectStore(OPERATION_STORE, { keyPath: 'id' });
        store.createIndex('namespace', 'namespace', { unique: false });
        store.createIndex('namespaceUpdatedAt', ['namespace', 'updatedAt'], { unique: false });
        store.createIndex('namespaceEntity', ['namespace', 'entityId'], { unique: false });
      }
      if (!database.objectStoreNames.contains(ATTACHMENT_STORE)) {
        const store = database.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
        store.createIndex('namespace', 'namespace', { unique: false });
        store.createIndex('operationId', ['namespace', 'operationId'], { unique: false });
      }
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Could not open secure offline storage.'));
  });
  return databasePromise;
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Offline storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction was aborted.'));
  });
}

async function readRecord<T>(storeName: string, id: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error || new Error('Could not read offline storage.'));
  });
}

async function readAll<T>(storeName: string, indexName?: string, query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
  const database = await openDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const source = indexName ? transaction.objectStore(storeName).index(indexName) : transaction.objectStore(storeName);
    const request = source.getAll(query);
    request.onsuccess = () => resolve((request.result || []) as T[]);
    request.onerror = () => reject(request.error || new Error('Could not read offline storage.'));
  });
}

async function writeRecord(storeName: string, value: unknown) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

async function deleteRecord(storeName: string, id: IDBValidKey) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
}

async function getOrCreateKey(namespace: string): Promise<CryptoKey> {
  const existing = await readRecord<StoredKey>(KEY_STORE, namespace);
  if (existing?.cryptoKey) return existing.cryptoKey;
  const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await writeRecord(KEY_STORE, { id: namespace, cryptoKey: created });
  const stored = await readRecord<StoredKey>(KEY_STORE, namespace);
  return stored?.cryptoKey || created;
}

async function encryptBytes(namespace: string, input: Uint8Array) {
  const key = await getOrCreateKey(namespace);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(namespace) },
    key,
    input,
  );
  return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

async function decryptBytes(namespace: string, value: EncryptedValue) {
  const key = await getOrCreateKey(namespace);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(value.iv), additionalData: encoder.encode(namespace) },
    key,
    new Uint8Array(value.ciphertext),
  );
  return new Uint8Array(plaintext);
}

async function encryptJson(namespace: string, value: unknown) {
  return encryptBytes(namespace, encoder.encode(JSON.stringify(value)));
}

async function decryptJson<T>(namespace: string, value: EncryptedValue): Promise<T> {
  return JSON.parse(decoder.decode(await decryptBytes(namespace, value))) as T;
}

function publicOperation(stored: StoredOperation): OfflineOperation {
  return {
    id: stored.id,
    idempotencyKey: stored.idempotencyKey,
    kind: stored.kind,
    employeeId: stored.employeeId,
    companyId: stored.companyId,
    entityType: stored.entityType,
    entityId: stored.entityId,
    capturedAt: stored.capturedAt,
    clientTimezone: stored.clientTimezone,
    state: stored.state,
    attemptCount: stored.attemptCount,
    nextAttemptAt: stored.nextAttemptAt,
    lastAttemptedAt: stored.lastAttemptedAt,
    lastErrorCategory: stored.lastErrorCategory,
    lastErrorMessage: stored.lastErrorMessage,
    dependencyRefs: stored.dependencyRefs,
    attachmentRefs: stored.attachmentRefs,
    serverReceipt: stored.serverReceipt,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

async function namespaceOperations(identity: OfflineIdentity) {
  const records = await readAll<StoredOperation>(OPERATION_STORE, 'namespace', IDBKeyRange.only(namespaceFor(identity)));
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function existingForEntity(identity: OfflineIdentity, entityId: string) {
  const records = await namespaceOperations(identity);
  return records.find((item) => item.entityId === entityId && item.state !== 'synced');
}

function clientTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

function nowIso() {
  return new Date().toISOString();
}

async function upsertOperationUnlocked(
  identity: OfflineIdentity,
  input: {
    operationId?: string;
    idempotencyKey?: string;
    kind: OfflineOperationKind;
    entityType: string;
    entityId: string;
    capturedAt?: string;
    clientTimezone?: string;
    state: OfflineOperationState;
    payload: unknown;
    attachmentRefs?: string[];
  },
) {
  const namespace = namespaceFor(identity);
  const current = input.operationId ? await readRecord<StoredOperation>(OPERATION_STORE, input.operationId) : await existingForEntity(identity, input.entityId);
  if (current && current.namespace !== namespace) throw new Error('Offline operation scope mismatch.');
  const timestamp = nowIso();
  const stored: StoredOperation = {
    id: current?.id || input.operationId || strongId('offline-op'),
    namespace,
    idempotencyKey: current?.idempotencyKey || input.idempotencyKey || strongId('offline-key'),
    kind: input.kind,
    employeeId: identity.employeeId,
    companyId: identity.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    capturedAt: current?.capturedAt || input.capturedAt || timestamp,
    clientTimezone: input.clientTimezone || current?.clientTimezone || clientTimezone(),
    state: input.state,
    attemptCount: current?.attemptCount || 0,
    nextAttemptAt: input.state === 'waiting-to-sync' ? undefined : current?.nextAttemptAt,
    lastAttemptedAt: current?.lastAttemptedAt,
    lastErrorCategory: input.state === 'local-draft' ? undefined : current?.lastErrorCategory,
    lastErrorMessage: input.state === 'local-draft' ? undefined : current?.lastErrorMessage,
    dependencyRefs: current?.dependencyRefs || [],
    attachmentRefs: input.attachmentRefs || current?.attachmentRefs || [],
    serverReceipt: input.state === 'local-draft' ? undefined : current?.serverReceipt,
    encryptedPayload: await encryptJson(namespace, input.payload),
    createdAt: current?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  await writeRecord(OPERATION_STORE, stored);
  broadcastChannel?.postMessage({ type: 'operation-updated', namespace, state: stored.state });
  return publicOperation(stored);
}

async function upsertOperation(identity: OfflineIdentity, input: Parameters<typeof upsertOperationUnlocked>[1]) {
  const lock = await withSyncLock(identity, () => upsertOperationUnlocked(identity, input));
  if (!lock.acquired || !lock.value) throw new Error('Another Staff Portal tab is saving this work. Please try again.');
  return lock.value;
}

export async function saveFormsDraft(identity: OfflineIdentity, input: FormsDraftInput) {
  const schemaRequiresLiveConnection = !input.supportedForOfflineSubmit;
  return upsertOperation(identity, {
    kind: 'forms.submit',
    entityType: 'workflow_form_assignment',
    entityId: input.assignmentId,
    state: 'local-draft',
    payload: {
      assignmentId: input.assignmentId,
      responses: input.responses,
      draftOnly: schemaRequiresLiveConnection,
      baseUpdatedAt: input.baseUpdatedAt,
      attachmentRefs: input.attachmentRefs || [],
    },
    attachmentRefs: input.attachmentRefs,
  });
}

export async function queueFormsSubmission(identity: OfflineIdentity, input: FormsDraftInput) {
  return upsertOperation(identity, {
    kind: 'forms.submit',
    entityType: 'workflow_form_assignment',
    entityId: input.assignmentId,
    state: 'waiting-to-sync',
    payload: {
      assignmentId: input.assignmentId,
      responses: input.responses,
      baseUpdatedAt: input.baseUpdatedAt,
      attachmentRefs: input.attachmentRefs || [],
    },
    attachmentRefs: input.attachmentRefs,
  });
}

export async function listOfflineOperations(identity: OfflineIdentity) {
  return (await namespaceOperations(identity)).map(publicOperation);
}

export async function readFormsDraft(identity: OfflineIdentity, assignmentId: string) {
  const current = await existingForEntity(identity, assignmentId);
  if (!current || current.kind !== 'forms.submit') return null;
  try {
    const payload = await decryptJson<{ responses?: Record<string, unknown> }>(current.namespace, current.encryptedPayload);
    return { operationId: current.id, responses: payload.responses || {}, state: current.state };
  } catch {
    return null;
  }
}

export async function readQueuedPayload<T>(identity: OfflineIdentity, operationId: string): Promise<T> {
  const stored = await readRecord<StoredOperation>(OPERATION_STORE, operationId);
  if (!stored || stored.namespace !== namespaceFor(identity)) throw new Error('Offline operation is not available in this account scope.');
  return decryptJson<T>(stored.namespace, stored.encryptedPayload);
}

export async function saveOfflineAttachment(
  identity: OfflineIdentity,
  input: { id?: string; operationId: string; originalName: string; mimeType: string; bytes: Uint8Array; sha256: string },
) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(input.mimeType)) throw new Error('This attachment type is not supported for offline work.');
  if (input.bytes.byteLength > 10 * 1024 * 1024) throw new Error('This attachment is larger than the offline limit.');
  const digest = await sha256Bytes(input.bytes);
  if (input.sha256 !== digest) throw new Error('This attachment failed its integrity check.');
  const id = input.id || strongId('offline-attachment');
  const record: StoredAttachment = {
    id,
    namespace: namespaceFor(identity),
    employeeId: identity.employeeId,
    companyId: identity.companyId,
    operationId: input.operationId,
    originalName: input.originalName.slice(0, 160),
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    sha256: digest,
    createdAt: nowIso(),
    encryptedBlob: await encryptBytes(namespaceFor(identity), input.bytes),
  };
  await writeRecord(ATTACHMENT_STORE, record);
  broadcastChannel?.postMessage({ type: 'attachment-updated', namespace: record.namespace });
  return { id, operationId: record.operationId, originalName: record.originalName, mimeType: record.mimeType, sizeBytes: record.sizeBytes, sha256: record.sha256 };
}

export async function readOfflineAttachment(identity: OfflineIdentity, id: string) {
  const record = await readRecord<StoredAttachment>(ATTACHMENT_STORE, id);
  if (!record || record.namespace !== namespaceFor(identity)) throw new Error('Offline attachment is not available in this account scope.');
  return { metadata: { id: record.id, operationId: record.operationId, originalName: record.originalName, mimeType: record.mimeType, sizeBytes: record.sizeBytes, sha256: record.sha256 }, bytes: await decryptBytes(record.namespace, record.encryptedBlob) };
}

export async function listOfflineAttachments(identity: OfflineIdentity, operationId: string) {
  const records = await readAll<StoredAttachment>(ATTACHMENT_STORE, 'operationId', IDBKeyRange.only([namespaceFor(identity), operationId]));
  return records.map((record) => ({ id: record.id, operationId: record.operationId, originalName: record.originalName, mimeType: record.mimeType, sizeBytes: record.sizeBytes, sha256: record.sha256 }));
}

async function deleteOfflineAttachment(identity: OfflineIdentity, id: string) {
  const record = await readRecord<StoredAttachment>(ATTACHMENT_STORE, id);
  if (record?.namespace === namespaceFor(identity)) await deleteRecord(ATTACHMENT_STORE, id);
}

async function uploadOfflineAttachments(identity: OfflineIdentity, operation: OfflineOperation) {
  for (const attachmentId of operation.attachmentRefs) {
    const attachment = await readOfflineAttachment(identity, attachmentId);
    const response = await fetch('/api/offline/attachments/' + encodeURIComponent(attachment.metadata.id), {
      method: 'PUT',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'content-type': attachment.metadata.mimeType,
        'content-length': String(attachment.metadata.sizeBytes),
        'x-offline-operation-id': operation.id,
        'x-offline-company-id': identity.companyId,
        'x-offline-file-name': attachment.metadata.originalName,
        'x-offline-sha256': attachment.metadata.sha256,
        'idempotency-key': operation.idempotencyKey,
      },
      body: attachment.bytes,
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      const error = new Error(body.error || 'The attachment could not be uploaded yet.') as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    await deleteOfflineAttachment(identity, attachment.metadata.id);
  }
}

async function updateStoredOperation(identity: OfflineIdentity, operationId: string, changes: Partial<StoredOperation>) {
  const current = await readRecord<StoredOperation>(OPERATION_STORE, operationId);
  if (!current || current.namespace !== namespaceFor(identity)) return;
  await writeRecord(OPERATION_STORE, { ...current, ...changes, updatedAt: nowIso() });
}

async function setQueuedState(identity: OfflineIdentity, operationId: string, state: OfflineOperationState, errorCategory?: string, errorMessage?: string) {
  await updateStoredOperation(identity, operationId, {
    state,
    lastErrorCategory: errorCategory,
    lastErrorMessage: errorMessage?.slice(0, 240),
  });
}

function retryDelay(attempt: number) {
  const base = Math.min(MAX_RETRY_DELAY_MS, 1000 * Math.pow(2, Math.min(attempt, 10)));
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(base * (0.75 + Math.random() * 0.5)));
}

async function lease(identity: OfflineIdentity, ownerId: string) {
  const id = 'sync-lease:' + namespaceFor(identity);
  const current = await readRecord<StoredMeta>(META_STORE, id);
  if (current?.expiresAt && new Date(current.expiresAt).getTime() > Date.now() && current.value !== ownerId) return false;
  await writeRecord(META_STORE, { id, kind: 'sync-lease', value: ownerId, expiresAt: new Date(Date.now() + 45_000).toISOString(), updatedAt: nowIso() });
  const verified = await readRecord<StoredMeta>(META_STORE, id);
  return verified?.value === ownerId;
}

async function releaseLease(identity: OfflineIdentity, ownerId: string) {
  const id = 'sync-lease:' + namespaceFor(identity);
  const current = await readRecord<StoredMeta>(META_STORE, id);
  if (current?.value === ownerId) await deleteRecord(META_STORE, id);
}

async function withSyncLock<T>(identity: OfflineIdentity, task: () => Promise<T>): Promise<{ acquired: boolean; value?: T }> {
  const name = 'daenem-offline-sync:' + namespaceFor(identity);
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
  if (locks) {
    let entered = false;
    let value: T | undefined;
    await locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      entered = true;
      value = await task();
    });
    return { acquired: entered, value };
  }
  const ownerId = strongId('sync-owner');
  if (!(await lease(identity, ownerId))) return { acquired: false };
  try { return { acquired: true, value: await task() }; } finally { await releaseLease(identity, ownerId); }
}

function openBroadcastChannel() {
  if (broadcastChannel || typeof BroadcastChannel === 'undefined') return;
  broadcastChannel = new BroadcastChannel(SYNC_CHANNEL);
}

export function watchOfflineChanges(listener: () => void) {
  openBroadcastChannel();
  const handler = (event: MessageEvent) => { if (event.data?.type === 'operation-updated' || event.data?.type === 'attachment-updated') listener(); };
  broadcastChannel?.addEventListener('message', handler);
  return () => broadcastChannel?.removeEventListener('message', handler);
}

type SyncRunResult = { processed: number; synced: number; needsReview: number; authRequired: number; retryable: number; skipped: boolean };

export async function syncQueuedOperations(identity: OfflineIdentity): Promise<SyncRunResult> {
  const empty: SyncRunResult = { processed: 0, synced: 0, needsReview: 0, authRequired: 0, retryable: 0, skipped: false };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return empty;
  const namespace = namespaceFor(identity);
  let result = empty;
  const execute = async () => {
    const operations = await namespaceOperations(identity);
    for (const operation of operations) {
      if (!['waiting-to-sync', 'failed-retryable'].includes(operation.state)) continue;
      if (operation.nextAttemptAt && new Date(operation.nextAttemptAt).getTime() > Date.now()) continue;
      result = { ...result, processed: result.processed + 1 };
      const attemptCount = operation.attemptCount + 1;
      await updateStoredOperation(identity, operation.id, { state: 'syncing', attemptCount, lastAttemptedAt: nowIso(), lastErrorCategory: undefined, lastErrorMessage: undefined });
      try {
        const payload = await readQueuedPayload<Record<string, unknown>>(identity, operation.id);
        const response = await fetch('/api/offline/sync', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'content-type': 'application/json', 'idempotency-key': operation.idempotencyKey },
          body: JSON.stringify({
            operationId: operation.id,
            idempotencyKey: operation.idempotencyKey,
            kind: operation.kind,
            employeeId: operation.employeeId,
            companyId: operation.companyId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            capturedAt: operation.capturedAt,
            clientTimezone: operation.clientTimezone,
            payload,
          }),
        });
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (response.ok && (body.state === 'synced' || body.ok === true)) {
          await uploadOfflineAttachments(identity, operation);
          await updateStoredOperation(identity, operation.id, {
            state: 'synced',
            serverReceipt: (body.receipt || body.result || body) as OfflineReceipt,
            nextAttemptAt: undefined,
            lastErrorCategory: undefined,
            lastErrorMessage: undefined,
          });
          result = { ...result, synced: result.synced + 1 };
        } else if (response.status === 401 || body.state === 'authentication-required') {
          await setQueuedState(identity, operation.id, 'authentication-required', 'authentication-required', 'Sign in to continue syncing.');
          result = { ...result, authRequired: result.authRequired + 1 };
        } else if (response.status === 403) {
          await setQueuedState(identity, operation.id, 'needs-review', 'permission-denied', 'Your current permission does not allow this queued action.');
          result = { ...result, needsReview: result.needsReview + 1 };
        } else if (response.status === 409) {
          await setQueuedState(identity, operation.id, 'needs-review', 'conflict', String(body.error || 'The server changed while this work was offline.'));
          result = { ...result, needsReview: result.needsReview + 1 };
        } else if (response.status >= 400 && response.status < 500) {
          await setQueuedState(identity, operation.id, 'needs-review', String(body.errorCategory || 'validation'), String(body.error || 'The server needs this work reviewed.'));
          result = { ...result, needsReview: result.needsReview + 1 };
        } else {
          throw new Error(String(body.error || 'The server could not accept this work yet.'));
        }
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 401) {
          await setQueuedState(identity, operation.id, 'authentication-required', 'authentication-required', 'Sign in to continue syncing.');
          result = { ...result, authRequired: result.authRequired + 1 };
        } else if (status === 403 || status === 409) {
          await setQueuedState(identity, operation.id, 'needs-review', status === 409 ? 'conflict' : 'permission-denied', error instanceof Error ? error.message : 'This queued work needs review.');
          result = { ...result, needsReview: result.needsReview + 1 };
        } else {
          const category = error instanceof TypeError ? 'network' : 'server-retryable';
          if (attemptCount >= MAX_RETRY_ATTEMPTS) {
          await setQueuedState(identity, operation.id, 'failed-terminal', 'retry-limit', 'Automatic retry limit reached. Review this item before trying again.');
          } else {
            await updateStoredOperation(identity, operation.id, {
              state: 'failed-retryable',
              nextAttemptAt: new Date(Date.now() + retryDelay(attemptCount)).toISOString(),
              lastErrorCategory: category,
              lastErrorMessage: error instanceof Error ? error.message.slice(0, 240) : 'Temporary sync failure.',
            });
          }
          result = { ...result, retryable: result.retryable + 1 };
        }
      }
    }
  };
  const lockResult = await withSyncLock(identity, execute);
  if (!lockResult.acquired) return { ...empty, skipped: true };
  openBroadcastChannel();
  broadcastChannel?.postMessage({ type: 'sync-finished', namespace });
  return result;
}

export async function saveCachedAuthContext(context: unknown, bootstrap: OfflineBootstrap) {
  const employeeId = String((context as { employee?: { id?: string } }).employee?.id || '');
  const companyId = String((context as { companies?: Array<{ id?: string }> }).companies?.[0]?.id || 'group');
  if (!employeeId) return;
  const namespace = namespaceFor({ employeeId, companyId });
  const value = await encryptJson(namespace, context);
  await writeRecord(META_STORE, {
    id: 'auth-snapshot:' + namespace,
    kind: 'auth-snapshot',
    namespace,
    verifiedAt: nowIso(),
    sessionExpiresAt: bootstrap.session.expiresAt,
    maxOfflineAgeMinutes: bootstrap.maxOfflineAgeMinutes,
    encrypted: value,
    updatedAt: nowIso(),
  } satisfies StoredMeta);
}

export async function readCachedAuthContext(): Promise<unknown | null> {
  try {
    const activeEmployeeId = typeof localStorage === 'undefined' ? '' : localStorage.getItem(ACTIVE_EMPLOYEE_KEY) || '';
    if (!activeEmployeeId) return null;
    const snapshots = (await readAll<StoredMeta>(META_STORE)).filter((item) => item.kind === 'auth-snapshot' && item.encrypted && item.namespace);
    snapshots.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    for (const snapshot of snapshots.slice(0, 5)) {
      const verifiedAt = new Date(String(snapshot.verifiedAt)).getTime();
      const expiresAt = new Date(String(snapshot.sessionExpiresAt)).getTime();
      const maxAge = Number(snapshot.maxOfflineAgeMinutes || 0) * 60_000;
      if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) || Date.now() > expiresAt || Date.now() - verifiedAt > maxAge) continue;
      try {
        const context = await decryptJson<unknown>(String(snapshot.namespace), snapshot.encrypted as EncryptedValue);
        const contextEmployeeId = String((context as { employee?: { id?: string } }).employee?.id || '');
        if (contextEmployeeId && contextEmployeeId === activeEmployeeId) return context;
      } catch { /* A different account namespace cannot decrypt this snapshot. */ }
    }
  } catch { /* Offline continuity is optional when the browser lacks durable storage. */ }
  return null;
}

// This marker is only an account-binding guard. Business payloads, attachments,
// credentials, and receipts remain in the encrypted IndexedDB stores.
export function setOfflineActiveEmployee(employeeId: string) {
  if (!employeeId || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(ACTIVE_EMPLOYEE_KEY, employeeId); } catch { /* optional account marker */ }
}

export function clearOfflineActiveEmployee() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(ACTIVE_EMPLOYEE_KEY); } catch { /* optional account marker */ }
}

export async function registerOfflineBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = registration && (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (sync) await sync.register('daenem-offline-sync');
  } catch { /* Background Sync is only an enhancement; page events remain authoritative. */ }
}

export async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

export function initOfflinePlatform() {
  openBroadcastChannel();
}
