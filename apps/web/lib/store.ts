/**
 * Tiny IndexedDB key/value store. The same database (`hyunwoo-talk` / `kv`) is
 * also opened by the service worker (`public/sw.js`) so it can read the shared
 * password and decrypt incoming push payloads.
 */
export const DB_NAME = "hyunwoo-talk";
export const STORE_NAME = "kv";
export const AUTH_KEY = "auth";

export interface AuthState {
  userId: string;
  peerId: string;
  /** Shared password used for end-to-end AES-GCM encryption. */
  password: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function loadAuth(): Promise<AuthState | undefined> {
  return idbGet<AuthState>(AUTH_KEY);
}

export function saveAuth(auth: AuthState): Promise<void> {
  return idbSet(AUTH_KEY, auth);
}

export function clearAuth(): Promise<void> {
  return idbDelete(AUTH_KEY);
}
