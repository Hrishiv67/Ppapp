/**
 * Sessions live in IndexedDB on this device only. There is no account and no
 * server, so this is the whole history.
 */
import type { SessionSummary } from "@/lib/engine";

export interface StoredSession {
  id: string;
  /** Epoch milliseconds when Start was tapped. */
  startedAt: number;
  summary: SessionSummary;
  demo?: boolean;
}

const DB_NAME = "rallybeat";
const STORE = "sessions";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const saveSession = (s: StoredSession) => run("readwrite", (st) => st.put(s)).then(() => s);

export const getSession = (id: string) =>
  run<StoredSession | undefined>("readonly", (st) => st.get(id) as IDBRequest<StoredSession | undefined>);

export const listSessions = () =>
  run<StoredSession[]>("readonly", (st) => st.getAll() as IDBRequest<StoredSession[]>).then((all) =>
    all.sort((a, b) => b.startedAt - a.startedAt),
  );

export const newSessionId = () => `s${Date.now().toString(36)}`;
