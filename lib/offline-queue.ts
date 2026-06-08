/**
 * IndexedDB queue for offline counter taps (counter-only — see frontend rules).
 * Taps are keyed by clientTxId so a re-enqueue is a no-op; the server replay is
 * idempotent on the same key.
 */

export type QueuedTap = {
  clientTxId: string;
  cardUid: string;
  counterId: string;
  at: string; // ISO timestamp of the tap
};

const DB_NAME = "mess-counter";
const STORE = "tap-queue";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientTxId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function enqueueTap(tap: QueuedTap): Promise<IDBValidKey> {
  return tx("readwrite", (s) => s.put(tap));
}

export function getQueuedTaps(): Promise<QueuedTap[]> {
  return tx<QueuedTap[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedTap[]>);
}

export async function removeTaps(clientTxIds: string[]): Promise<void> {
  if (clientTxIds.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    for (const id of clientTxIds) store.delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

export async function queueCount(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}
