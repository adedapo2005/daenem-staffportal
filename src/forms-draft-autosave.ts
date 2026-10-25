/**
 * One Forms Center writer across all assigned forms in this mounted/scope-bound
 * view. Coalesce fast keystrokes, serialize encrypted IndexedDB writes and
 * suspend an assignment before a submit/queue operation can replace its draft.
 *
 * This is an in-memory scheduling aid, NOT a second persistence writer.
 * The existing offline platform remains the only durable writer and continues
 * to check current employee/company permissions before and after each write.
 */
export function createLatestFormsDraftWriter<T>(
  persist: (assignmentId: string, draft: T) => Promise<unknown>,
  reportFailure: (assignmentId: string, error: unknown) => void,
  delayMs = 350,
) {
  const pending = new Map<string, T>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const suspended = new Set<string>();
  let tail: Promise<void> = Promise.resolve();
  let writing = 0;
  let enqueued = 0;
  let disposed = false;

  function clearTimer(key: string) {
    const timer = timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(key);
  }

  function enqueue(key: string): Promise<void> {
    clearTimer(key);
    if (disposed || suspended.has(key) || !pending.has(key)) return tail;
    const draft = pending.get(key)!;
    pending.delete(key);
    enqueued += 1;
    const write = tail.then(async () => {
      if (disposed || suspended.has(key)) return;
      writing += 1;
      try {
        await persist(key, draft);
      } catch (error) {
        // A later edit always takes precedence over an older failed snapshot.
        if (!disposed && !suspended.has(key) && !pending.has(key)) pending.set(key, draft);
        reportFailure(key, error);
        throw error;
      } finally {
        writing -= 1;
      }
    }).finally(() => { enqueued -= 1; });
    // Keep the shared queue usable even when an individual write fails.
    tail = write.then(() => undefined, () => undefined);
    return write;
  }

  function schedule(key: string, draft: T): boolean {
    if (disposed || suspended.has(key)) return false;
    pending.set(key, draft);
    clearTimer(key);
    timers.set(key, setTimeout(() => { void enqueue(key).catch(() => undefined); }, Math.max(0, delayMs)));
    return true;
  }

  function flush(key: string): Promise<void> {
    return enqueue(key);
  }

  async function flushAll(): Promise<void> {
    const jobs = Array.from(pending.keys()).map(key => enqueue(key));
    await Promise.all(jobs);
    await tail;
  }

  async function suspend(key: string): Promise<void> {
    // Drop scheduled older drafts. The submit action writes the exact latest
    // snapshot itself and must not be overwritten by a delayed autosave.
    suspended.add(key);
    clearTimer(key);
    pending.delete(key);
    await tail;
  }

  function resume(key: string) {
    if (!disposed) suspended.delete(key);
  }

  function isSuspended(key: string) {
    return suspended.has(key);
  }

  function hasUnsaved() {
    return pending.size > 0 || writing > 0 || enqueued > 0;
  }

  function dispose() {
    disposed = true;
    for (const key of timers.keys()) clearTimer(key);
    pending.clear();
    suspended.clear();
  }

  return { schedule, flush, flushAll, suspend, resume, isSuspended, hasUnsaved, dispose };
}


/**
 * React Strict Mode invokes effect setup -> cleanup -> setup in development.
 * A cleanup cannot immediately dispose the draft writer: that would disable
 * autosaving on the second setup. Defer ordinary-unmount disposal to a microtask
 * and cancel it when the effect is re-established in the same commit.
 *
 * Permission/session revocation is different: abort the old scoped writer
 * synchronously instead of flushing potentially unauthorised draft content.
 */
export function createFormsDraftWriterLifecycle(
  writer: { flushAll: () => Promise<void>; dispose: () => void },
) {
  let setupGeneration = 0;
  function setup() {
    return ++setupGeneration;
  }
  function cleanup(generation: number, scopeRevoked: boolean) {
    if (scopeRevoked) {
      writer.dispose();
      return;
    }
    queueMicrotask(() => {
      if (generation !== setupGeneration) return; // Strict Mode replay.
      void writer.flushAll().catch(() => undefined).finally(() => {
        if (generation === setupGeneration) writer.dispose();
      });
    });
  }
  return { setup, cleanup };
}
